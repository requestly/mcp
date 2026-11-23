import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
 */

export const CODE_RULE_TYPES = new Set(["Script", "Request", "Response"]);

/** Longest code shown inside the dialog itself; longer code is reviewed in a local file. */
export const DIALOG_CODE_LIMIT = 5000;

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

/**
 * Render code between start/end markers carrying a random nonce, so code that
 * contains its own "end of code" line cannot make the dialog look like the code
 * stopped early and the rest is our text.
 */
function renderCode(title: string, items: CodeItem[], nonce: string): string {
  const total = items.reduce((n, i) => n + i.code.length, 0);
  const parts = items.map(
    (i, idx) =>
      `--- ${idx + 1} of ${items.length}: ${i.label}; runs on ${i.where} ---\n${i.code}`
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

/**
 * Ask the human to accept new code. Short code is shown in the dialog; longer
 * code is written to a private local file named in the dialog, and re-read on
 * Accept: if it changed while the dialog was open, nothing is saved.
 */
export async function askHumanToAcceptCode(
  server: McpServer,
  req: CodeReviewRequest,
  options: { relatedRequestId?: string | number; signal?: AbortSignal } = {}
): Promise<CodeReviewOutcome> {
  const nonce = randomBytes(6).toString("hex");
  const name = JSON.stringify(req.name ?? "").slice(0, 200);
  const verb = req.action === "create" ? "create" : "change the code of";
  const header =
    `The AI wants to ${verb} the Requestly ${req.ruleType} rule ${name}. ` +
    `This code runs in your browser. It is saved only if you accept; status after saving: ${req.status}.`;
  const added = renderCode(
    req.action === "create" ? "Code to be saved" : "New code to be saved",
    req.added,
    nonce
  );
  const replaced =
    req.action === "update" && req.replaced && req.replaced.length
      ? "\n\n" + renderCode("Saved code it replaces", req.replaced, nonce)
      : "";
  const review = `${added}${replaced}`;
  const footer = "\n\nAccept only if you have read this code and want it saved.";

  if (review.length <= DIALOG_CODE_LIMIT) {
    return askHumanToApprove(server, `${header}\n\n${review}${footer}`, options);
  }

  // Too long to show in the dialog: review it in a private local file instead.
  let dir: string | undefined;
  try {
    dir = mkdtempSync(join(tmpdir(), "requestly-mcp-review-"));
    const file = join(dir, `code-${nonce}.txt`);
    writeFileSync(file, review, { mode: 0o600, flag: "wx" });
    const outcome = await askHumanToApprove(
      server,
      `${header}\n\nThe code is too long to show here (${review.length} characters). ` +
        `Open this file and read it before you accept:\n${file}\n` +
        `If the file is changed while this prompt is open, nothing is saved.${footer}`,
      options
    );
    if (!outcome.approved) return outcome;
    let now: string;
    try {
      now = readFileSync(file, "utf8");
    } catch {
      return { approved: false, reason: "file-changed" };
    }
    return now === review ? outcome : { approved: false, reason: "file-changed" };
  } catch (error) {
    console.error("Code review file could not be prepared:", error);
    return { approved: false, reason: "failed" };
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
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
