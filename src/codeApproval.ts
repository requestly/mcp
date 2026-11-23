import { randomBytes } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { askHumanToApprove, type ApprovalOutcome } from "./humanApproval.js";

/**
 * RQ-3011 / RQ-3005 / RQ-3033 (Script rules) and RQ-3021 / RQ-3039 (Request and
 * Response rules): code the model writes is only saved after the human has seen
 * it and accepted it in the host (MCP elicitation).
 *
 * The rule, decided 23 Nov 2026: ask whenever the model creates a rule that has
 * code, or changes the code of a saved rule. Turning a rule on or off, renaming
 * it, or changing where it runs does not ask; that only ever runs code a person
 * has already seen (here) or written (in the Requestly app).
 *
 * "Code" is everything that ends up executing or being served in the browser:
 * - Script rules: each script's value (inline code, or the URL of a script to
 *   load) plus its tag attributes (an `onload` attribute is code too);
 * - Request and Response rules: the body, code or static (a static HTML
 *   response can carry a <script> as well).
 *
 * Where the human reads the code: hosts show only part of a prompt (Claude Code
 * 2.1.330 shows at most 3 lines, each cut at the terminal width, with no way to
 * expand). So the prompt itself is kept to 3 short lines. Code that is one short
 * line of plain ASCII is shown in the prompt; anything else is written to a
 * private file under ~/.requestly-mcp/review/ that the prompt links to (file://). That file
 * is re-read on Accept (nothing is saved if it changed) and deleted afterwards.
 */

export const CODE_RULE_TYPES = new Set(["Script", "Request", "Response"]);

/** Longest single line of code shown inside the prompt itself. */
export const INLINE_CODE_LIMIT = 60;

/** Most lines a prompt may have (Claude Code shows 3). */
export const PROMPT_MAX_LINES = 3;

type Pair = Record<string, any>;

export type CodeItem = {
  /** Identity used to tell new code from saved code. */
  key: string;
  /** Short label: what kind of code this is. */
  label: string;
  /** Where it runs, from the pair's source. */
  where: string;
  /** The code itself, exactly as it will be saved. */
  code: string;
  /** True when the item carries more than its value (e.g. script tag attributes). */
  hasExtras: boolean;
};

function describeSource(source: any): string {
  if (!source || typeof source !== "object") return "(no URL match)";
  return `${source.key ?? "?"} ${source.operator ?? "?"} ${JSON.stringify(String(source.value ?? "")).slice(0, 200)}`;
}

/** Every piece of code a rule's pairs carry. Empty for rule types without code. */
export function codeItems(ruleType: string, pairs: unknown): CodeItem[] {
  if (!CODE_RULE_TYPES.has(ruleType) || !Array.isArray(pairs)) return [];
  const items: CodeItem[] = [];
  for (const pair of pairs as Pair[]) {
    const where = describeSource(pair?.source);
    if (ruleType === "Script") {
      for (const s of Array.isArray(pair?.scripts) ? pair.scripts : []) {
        const attributes = Array.isArray(s?.attributes) ? s.attributes : [];
        const value = String(s?.value ?? "");
        const attrText = attributes.length
          ? "\n" + attributes.map((a: any) => `[tag attribute] ${String(a?.name ?? "")}=${String(a?.value ?? "")}`).join("\n")
          : "";
        items.push({
          key: JSON.stringify(["script", s?.codeType ?? null, s?.type ?? null, value, attributes]),
          label: `${s?.codeType ?? "?"} ${s?.type === "url" ? "script loaded from a URL" : "inline code"}, ${s?.loadTime ?? "?"}`,
          where,
          code: value + attrText,
          hasExtras: attributes.length > 0,
        });
      }
    } else {
      const part = ruleType === "Request" ? pair?.request : pair?.response;
      if (part && typeof part === "object") {
        const value = String(part.value ?? "");
        items.push({
          key: JSON.stringify([ruleType, part.type ?? null, value]),
          label: `${ruleType.toLowerCase()} body (${part.type ?? "?"})`,
          where,
          code: value,
          hasExtras: false,
        });
      }
    }
  }
  return items;
}

/** Items in `next` that are not already saved in `prev` (counted, so a duplicate is new too). */
export function newCode(prev: CodeItem[], next: CodeItem[]): CodeItem[] {
  const counts = new Map<string, number>();
  for (const p of prev) counts.set(p.key, (counts.get(p.key) ?? 0) + 1);
  const added: CodeItem[] = [];
  for (const n of next) {
    const c = counts.get(n.key) ?? 0;
    if (c > 0) counts.set(n.key, c - 1);
    else added.push(n);
  }
  return added;
}

/** Printable ASCII only: nothing that can hide, reorder or break a line in a terminal. */
const PLAIN_ASCII = /^[\x20-\x7e]*$/;
/** Characters that can make code look different from what it is (Trojan Source and friends). */
const DECEPTIVE = /[\u0000-\u0008\u000b-\u001f\u007f\u0085\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/;

/** One short line of plain ASCII, without extras: safe to show in full inside the prompt. */
function fitsInline(item: CodeItem): boolean {
  return !item.hasExtras && item.code.length <= INLINE_CODE_LIMIT && PLAIN_ASCII.test(item.code);
}

/**
 * The review file: code between start/end markers carrying a random nonce, so
 * code that contains its own "end of code" line cannot make the file look like
 * the code stopped early and the rest is our text.
 */
function renderSection(title: string, items: CodeItem[], nonce: string): string {
  const total = items.reduce((n, i) => n + i.code.length, 0);
  const parts = items.map(
    (i, idx) => `--- ${idx + 1} of ${items.length}: ${i.label}; runs on ${i.where} ---\n${i.code}`
  );
  return (
    `${title} (${items.length} item${items.length === 1 ? "" : "s"}, ${total} characters)\n` +
    `=== start of code ${nonce} ===\n${parts.join("\n")}\n=== end of code ${nonce} ===`
  );
}

export type CodeReviewRequest = {
  /** "create" a new rule, or "update" a saved one. */
  action: "create" | "update";
  ruleType: string;
  /** Rule name as it will be saved (model-supplied, shown quoted). */
  name: string;
  /** Status the rule will have after saving. */
  status: string;
  /** Code being added or changed (what the human must accept). */
  added: CodeItem[];
  /** For an update: the saved code that the new code replaces. */
  replaced?: CodeItem[];
};

export type CodeReviewOutcome = ApprovalOutcome | { approved: false; reason: "file-changed" };

/** ~/.requestly-mcp/review, private to the user; refuses to follow a symlink. */
function reviewDir(): string {
  const base = join(homedir(), ".requestly-mcp");
  const dir = join(base, "review");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (const d of [base, dir]) {
    if (lstatSync(d).isSymbolicLink()) throw new Error(`${d} is a symlink; refusing to write code for review there`);
  }
  chmodSync(dir, 0o700);
  return dir;
}

/** Identity and change history of a file: inode, size, last modification and last change (ns). */
function fingerprint(path: string): string {
  const st = statSync(path, { bigint: true });
  return `${st.dev}:${st.ino}:${st.size}:${st.mtimeNs}:${st.ctimeNs}`;
}

/**
 * Ask the human to accept new code, in a prompt of at most 3 short lines.
 * Short plain code is shown in the prompt; anything else is reviewed in a
 * private local file that the prompt names and that is re-read on Accept.
 */
export async function askHumanToAcceptCode(
  server: McpServer,
  req: CodeReviewRequest,
  options: { relatedRequestId?: string | number; signal?: AbortSignal } = {}
): Promise<CodeReviewOutcome> {
  const nonce = randomBytes(6).toString("hex");
  // Model-supplied name: JSON-quoted (no line breaks) and kept short so line 1 stays readable.
  const shortName = req.name.length > 30 ? req.name.slice(0, 29) + "…" : req.name;
  const name = JSON.stringify(shortName);
  const replaced = req.action === "update" ? req.replaced ?? [] : [];
  const what =
    req.action === "create"
      ? `Create ${req.ruleType} rule ${name} (saved ${req.status})`
      : `Change the code of ${req.ruleType} rule ${name} (${req.status})`;

  const inline =
    req.added.length === 1 && replaced.length <= 1 && [...req.added, ...replaced].every(fitsInline);
  if (inline) {
    const lines =
      req.action === "create"
        ? [`${what}. Its code:`, `Code: ${req.added[0].code}`]
        : [`${what}:`, `New: ${req.added[0].code}`, ...(replaced.length ? [`Was: ${replaced[0].code}`] : [])];
    return askHumanToApprove(server, lines.join("\n"), options);
  }

  // Review in a private local file.
  const sections = renderSection(
    req.action === "create" ? "Code to be saved" : "New code to be saved",
    req.added,
    nonce
  );
  const oldSection = replaced.length ? "\n\n" + renderSection("Saved code it replaces", replaced, nonce) : "";
  const review =
    `Requestly MCP: code waiting for your approval\n` +
    `${req.action === "create" ? "Create" : "Change the code of"} ${req.ruleType} rule ${JSON.stringify(req.name)}\n` +
    `Status after saving: ${req.status}\n\n` +
    `${sections}${oldSection}\n`;
  const all = [...req.added, ...replaced].map((i) => i.code).join("\n");
  const lineCount = req.added.reduce((n, i) => n + i.code.split("\n").length, 0);
  const charCount = req.added.reduce((n, i) => n + i.code.length, 0);

  let file: string | undefined;
  try {
    file = join(reviewDir(), `${nonce}.txt`);
    writeFileSync(file, review, { mode: 0o600, flag: "wx" });
    // Any write to the file, even one that puts the original text back, moves its
    // change time (ctime), which ordinary programs cannot set back; replacing the
    // file changes its inode. Both are compared on Accept, as well as the text.
    const written = fingerprint(file);
    const warning = DECEPTIVE.test(all) ? "Has invisible or text-direction characters! " : "";
    const outcome = await askHumanToApprove(
      server,
      [
        `${what}. Read the code in this file first:`,
        // Alone on its line so a narrow terminal can't cut the link short; terminals
        // make file:// URLs clickable (Cmd/Ctrl-click).
        pathToFileURL(file).href,
        `${lineCount} line${lineCount === 1 ? "" : "s"}, ${charCount} characters. ${warning}Changing the file cancels the save.`,
      ].join("\n"),
      options
    );
    if (!outcome.approved) return outcome;
    let now: string;
    let after: string;
    try {
      after = fingerprint(file);
      now = readFileSync(file, "utf8");
    } catch {
      return { approved: false, reason: "file-changed" };
    }
    return now === review && after === written ? outcome : { approved: false, reason: "file-changed" };
  } catch (error) {
    console.error("Code review file could not be prepared:", error);
    return { approved: false, reason: "failed" };
  } finally {
    if (file) rmSync(file, { force: true });
  }
}

/** Tool result text when new code was not accepted. Never suggests retrying on the user's behalf. */
export function codeNotApprovedText(
  what: string,
  reason: Exclude<CodeReviewOutcome, { approved: true }>["reason"]
): string {
  switch (reason) {
    case "unsupported":
      return (
        `Not saved: ${what}. This MCP host can't ask the user to approve code in a rule ` +
        `(it doesn't support MCP elicitation). Rules with code can be created and edited in the ` +
        `Requestly app: https://app.requestly.io/rules/my-rules`
      );
    case "declined":
    case "cancelled":
      return `Not saved: the user did not approve the code in ${what}. Nothing was changed. Do not retry unless the user asks again.`;
    case "failed":
      return `Not saved: the approval request for ${what} failed or timed out. Nothing was changed.`;
    case "file-changed":
      return (
        `Not saved: the review file for ${what} changed while the approval prompt was open, ` +
        `so what was reviewed may not be what would be saved. Nothing was changed.`
      );
  }
}
