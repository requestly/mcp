import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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
 * line of plain ASCII is shown in the prompt. Anything else is written to a
 * private file under ~/.requestly-mcp/review/, named in the prompt and opened in
 * the user's default text editor. The user may edit it: what the file holds
 * when they click Accept is what gets saved (decided 23 Nov). It is deleted
 * afterwards.
 */

export const CODE_RULE_TYPES = new Set(["Script", "Request", "Response"]);

/** Longest single line of code shown inside the prompt itself. */
export const INLINE_CODE_LIMIT = 60;

type Pair = Record<string, any>;
type Attribute = { name: string; value: string };

export type CodeItem = {
  /** Identity used to tell new code from saved code. */
  key: string;
  /** Short label: what kind of code this is. */
  label: string;
  /** Where it runs, from the pair's source. */
  where: string;
  /** The value exactly as it will be saved (script code or URL, or body). */
  value: string;
  /** Script tag attributes, when the script has any. */
  attributes?: Attribute[];
  /** Where the value lives in the rule's pairs. */
  ref: { pair: number; script?: number };
};

/** What the user accepted for each reviewed item (possibly edited in the review file). */
export type AcceptedCode = { value: string; attributes?: Attribute[] };

function describeSource(source: any): string {
  if (!source || typeof source !== "object") return "(no URL match)";
  return `${source.key ?? "?"} ${source.operator ?? "?"} ${JSON.stringify(String(source.value ?? "")).slice(0, 200)}`;
}

/** Everything a person reads for an item: its value, then its tag attributes. */
function shownText(item: CodeItem): string {
  const attrs = item.attributes?.length
    ? "\n" + item.attributes.map((a) => `[tag attribute] ${JSON.stringify(a)}`).join("\n")
    : "";
  return item.value + attrs;
}

/** Every piece of code a rule's pairs carry. Empty for rule types without code. */
export function codeItems(ruleType: string, pairs: unknown): CodeItem[] {
  if (!CODE_RULE_TYPES.has(ruleType) || !Array.isArray(pairs)) return [];
  const items: CodeItem[] = [];
  (pairs as Pair[]).forEach((pair, p) => {
    const where = describeSource(pair?.source);
    if (ruleType === "Script") {
      (Array.isArray(pair?.scripts) ? pair.scripts : []).forEach((s: any, j: number) => {
        const attributes: Attribute[] = Array.isArray(s?.attributes)
          ? s.attributes.map((a: any) => ({ name: String(a?.name ?? ""), value: String(a?.value ?? "") }))
          : [];
        const value = String(s?.value ?? "");
        items.push({
          key: JSON.stringify(["script", s?.codeType ?? null, s?.type ?? null, value, attributes]),
          label: `${s?.codeType ?? "?"} ${s?.type === "url" ? "script loaded from a URL" : "inline code"}, ${s?.loadTime ?? "?"}`,
          where,
          value,
          attributes: attributes.length ? attributes : undefined,
          ref: { pair: p, script: j },
        });
      });
    } else {
      const part = ruleType === "Request" ? pair?.request : pair?.response;
      if (part && typeof part === "object") {
        const value = String(part.value ?? "");
        items.push({
          key: JSON.stringify([ruleType, part.type ?? null, value]),
          label: `${ruleType.toLowerCase()} body (${part.type ?? "?"})`,
          where,
          value,
          ref: { pair: p },
        });
      }
    }
  });
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

/**
 * Put accepted (possibly edited) values back into a copy of the pairs, at the
 * places the reviewed items came from.
 */
export function applyAccepted(ruleType: string, pairs: unknown, items: CodeItem[], accepted: AcceptedCode[]): unknown {
  const copy: Pair[] = JSON.parse(JSON.stringify(pairs));
  items.forEach((item, i) => {
    const a = accepted[i];
    const pair = copy[item.ref.pair];
    if (ruleType === "Script" && item.ref.script !== undefined) {
      const script = pair.scripts[item.ref.script];
      script.value = a.value;
      if (item.attributes) script.attributes = a.attributes ?? [];
    } else {
      (ruleType === "Request" ? pair.request : pair.response).value = a.value;
    }
  });
  return copy;
}

/** Printable ASCII only: nothing that can hide, reorder or break a line in a terminal. */
const PLAIN_ASCII = /^[\x20-\x7e]*$/;
/** Characters that can make code look different from what it is (Trojan Source and friends). */
const DECEPTIVE = /[\u0000-\u0008\u000b-\u001f\u007f\u0085\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/;

/** One short line of plain ASCII, without attributes: safe to show in full inside the prompt. */
function fitsInline(item: CodeItem): boolean {
  return !item.attributes && item.value.length <= INLINE_CODE_LIMIT && PLAIN_ASCII.test(item.value);
}

/*
 * The review file. Markers carry a random nonce (unknown when the code was
 * written), so code cannot fake them; the file is read back by those markers.
 *
 *   === start of code <nonce> ===
 *   --- item 1 of 2 <nonce>: <label>; runs on <where> ---
 *   <value>
 *   --- tag attributes of item 1 <nonce>: one {"name","value"} JSON object per line ---
 *   {"name":"onload","value":"init()"}
 *   --- item 2 of 2 <nonce>: ... ---
 *   <value>
 *   === end of code <nonce> ===
 */
function itemHeader(i: number, n: number, nonce: string, item: CodeItem): string {
  return `--- item ${i} of ${n} ${nonce}: ${item.label}; runs on ${item.where} ---`;
}
function attrHeader(i: number, nonce: string): string {
  return `--- tag attributes of item ${i} ${nonce}: one {"name","value"} JSON object per line ---`;
}

function renderEditable(items: CodeItem[], nonce: string): string {
  const out = [`=== start of code ${nonce} ===`];
  items.forEach((item, idx) => {
    out.push(itemHeader(idx + 1, items.length, nonce, item), item.value);
    if (item.attributes) {
      // JSON per attribute, so any name or value (with "=", line breaks...) reads back exactly.
      out.push(attrHeader(idx + 1, nonce), ...item.attributes.map((a) => JSON.stringify({ name: a.name, value: a.value })));
    }
  });
  out.push(`=== end of code ${nonce} ===`);
  return out.join("\n");
}

/** Read the code back out of the (possibly edited) review file; undefined if its markers are broken. */
export function parseEditable(text: string, items: CodeItem[], nonce: string): AcceptedCode[] | undefined {
  const lines = text.split("\n");
  // Marker lines are matched ignoring a trailing CR; code lines are kept exactly.
  const bare = (l: string) => l.replace(/\r$/, "");
  const start = lines.findIndex((l) => bare(l) === `=== start of code ${nonce} ===`);
  const end = lines.findIndex((l) => bare(l) === `=== end of code ${nonce} ===`);
  if (start < 0 || end < start) return undefined;
  const body = lines.slice(start + 1, end);
  const isItem = (l: string) => new RegExp(`^--- item (\\d+) of (\\d+) ${nonce}: .* ---$`).exec(bare(l));
  const isAttr = (l: string) => new RegExp(`^--- tag attributes of item (\\d+) ${nonce}: .* ---$`).exec(bare(l));
  const result: AcceptedCode[] = [];
  let i = 0;
  while (i < body.length) {
    const m = isItem(body[i]);
    if (!m || Number(m[1]) !== result.length + 1 || Number(m[2]) !== items.length) return undefined;
    i++;
    const valueLines: string[] = [];
    while (i < body.length && !isItem(body[i]) && !isAttr(body[i])) valueLines.push(body[i++]);
    const entry: AcceptedCode = { value: valueLines.join("\n") };
    const item = items[result.length];
    if (i < body.length && isAttr(body[i])) {
      if (!item?.attributes || Number(isAttr(body[i])![1]) !== result.length + 1) return undefined;
      i++;
      const attributes: Attribute[] = [];
      while (i < body.length && !isItem(body[i])) {
        const line = bare(body[i++]);
        if (line.trim() === "") continue;
        let a: any;
        try {
          a = JSON.parse(line);
        } catch {
          return undefined;
        }
        if (!a || typeof a.name !== "string" || typeof a.value !== "string") return undefined;
        attributes.push({ name: a.name, value: a.value });
      }
      entry.attributes = attributes;
    } else if (item?.attributes) {
      return undefined;
    }
    result.push(entry);
  }
  return result.length === items.length ? result : undefined;
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

export type CodeReviewOutcome =
  | { approved: true; accepted: AcceptedCode[]; edited: boolean }
  | Exclude<ApprovalOutcome, { approved: true }>
  | { approved: false; reason: "file-unreadable" };

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

/**
 * Open the review file in the user's default app for text files, so they don't
 * have to find it (terminals don't reliably make a path in the prompt
 * clickable). Best effort: never blocks, never writes to stdout (the MCP channel).
 * Set REQUESTLY_MCP_OPEN_REVIEW_FILE=0 to turn it off.
 */
function openForReview(file: string): void {
  if (process.env.REQUESTLY_MCP_OPEN_REVIEW_FILE === "0") return;
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [file]]
      : process.platform === "win32"
        ? ["explorer.exe", [file]]
        : ["xdg-open", [file]];
  try {
    const child = spawn(cmd, args as string[], { detached: true, stdio: "ignore" });
    child.on("error", (error) => console.error("Could not open the review file:", error));
    child.unref();
  } catch (error) {
    console.error("Could not open the review file:", error);
  }
}

/**
 * Ask the human to accept new code, in a prompt of at most 3 short lines.
 * Short plain code is shown in the prompt; anything else is reviewed (and may
 * be edited) in a private local file, and what that file holds on Accept is
 * what gets saved.
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
  const unchanged = (): CodeReviewOutcome => ({
    approved: true,
    accepted: req.added.map((i) => ({ value: i.value, attributes: i.attributes })),
    edited: false,
  });

  const inline =
    req.added.length === 1 && replaced.length <= 1 && [...req.added, ...replaced].every(fitsInline);
  if (inline) {
    const lines =
      req.action === "create"
        ? [`${what}. Its code:`, `Code: ${req.added[0].value}`]
        : [`${what}:`, `New: ${req.added[0].value}`, ...(replaced.length ? [`Was: ${replaced[0].value}`] : [])];
    const outcome = await askHumanToApprove(server, lines.join("\n"), options);
    return outcome.approved ? unchanged() : outcome;
  }

  // Review (and optionally edit) in a private local file.
  const reference = replaced.length
    ? "\n\nFor reference, the saved code this replaces (edits below this line are ignored):\n" +
      replaced.map((r, i) => `--- saved ${i + 1} of ${replaced.length}: ${r.label}; runs on ${r.where} ---\n${shownText(r)}`).join("\n")
    : "";
  const review =
    `Requestly MCP: ${req.action === "create" ? "create" : "change the code of"} ${req.ruleType} rule ` +
    `${JSON.stringify(req.name)} (status after saving: ${req.status}).\n` +
    `Read the code between the start and end lines. You may edit it: what this file holds when you ` +
    `click Accept is what gets saved. Keep the marker lines as they are.\n\n` +
    `${renderEditable(req.added, nonce)}${reference}\n`;
  const all = [...req.added, ...replaced].map(shownText).join("\n");
  const lineCount = req.added.reduce((n, i) => n + shownText(i).split("\n").length, 0);
  const charCount = req.added.reduce((n, i) => n + shownText(i).length, 0);

  let file: string | undefined;
  try {
    file = join(reviewDir(), `${nonce}.txt`);
    writeFileSync(file, review, { mode: 0o600, flag: "wx" });
    openForReview(file);
    const warning = DECEPTIVE.test(all) ? "Has hidden or bidi characters! " : "";
    const outcome = await askHumanToApprove(
      server,
      [
        `${what}. Review or edit its code in:`,
        // Alone on its line so a narrow terminal can't cut the path short.
        file,
        `${lineCount} line${lineCount === 1 ? "" : "s"}, ${charCount} characters. ${warning}The file's code on Accept is saved.`,
      ].join("\n"),
      options
    );
    if (!outcome.approved) return outcome;
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      return { approved: false, reason: "file-unreadable" };
    }
    // An editor may have re-saved the whole file with Windows line endings (no bare
    // LF left, where the original had some): undo that. An unchanged file, even one
    // whose code contains CRLF, is left exactly as written.
    const hasBareLF = (t: string) => /(^|[^\r])\n/.test(t);
    if (text !== review && !hasBareLF(text) && hasBareLF(review)) text = text.replace(/\r\n/g, "\n");
    const accepted = parseEditable(text, req.added, nonce);
    if (!accepted) return { approved: false, reason: "file-unreadable" };
    const edited = accepted.some(
      (a, i) => a.value !== req.added[i].value || JSON.stringify(a.attributes) !== JSON.stringify(req.added[i].attributes)
    );
    return { approved: true, accepted, edited };
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
    case "file-unreadable":
      return (
        `Not saved: the review file for ${what} could not be read back (it was removed, or its start, end ` +
        `or item lines were changed). Nothing was changed.`
      );
  }
}

/** Note added to a successful result when the user edited the code before accepting. */
export const EDITED_NOTE =
  "\n\nNOTE: the user edited the code before accepting; the saved code differs from what was sent. Read the rule back before changing it again.";
