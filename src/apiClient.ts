import { z } from "zod";

/**
 * Shared helpers for the Requestly REST calls every tool handler makes.
 *
 * RQ-3018 (F-008, and the sibling F-006/F-009/F-010/F-011 sites): resource ids
 * arrive from the LLM and get interpolated into the request path. They are
 * percent-encoded here, so `../groups/VICTIM` becomes `..%2Fgroups%2FVICTIM`
 * and can never traverse out of its own collection.
 *
 * RQ-3025 (F-023): upstream error bodies are never handed back to the LLM.
 * Anything that can influence an error body — a proxy, an MITM, a reflective
 * upstream validation message — otherwise owns an indirect prompt-injection
 * channel straight into the model's context. The raw body goes to stderr;
 * stdout carries the JSON-RPC framing and must not be polluted.
 */

export const REQUESTLY_API_BASE = "https://api2.requestly.io/v1";

/**
 * RQ-3018 defense-in-depth: reject traversal characters at the schema boundary
 * so a hostile id is refused before it ever reaches fetch(). Pattern is the one
 * prescribed by the finding.
 */
export const RESOURCE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export const resourceIdSchema = z
  .string()
  .regex(
    RESOURCE_ID_PATTERN,
    "Invalid id: only letters, digits, underscore and hyphen are allowed."
  );

export type ResourceCollection = "rules" | "groups";

/** Build `<base>/<collection>/<id>` with the id safely encoded. */
export function buildResourceUrl(
  collection: ResourceCollection,
  id: string
): string {
  const prefix = `${REQUESTLY_API_BASE}/${collection}/`;
  const url = `${prefix}${encodeURIComponent(id)}`;
  // encodeURIComponent already makes this unreachable; the assertion exists so a
  // future refactor that drops the encoding fails loudly instead of silently
  // reopening the traversal.
  if (!url.startsWith(prefix)) {
    throw new Error("Resolved request URL left its expected base path.");
  }
  return url;
}

export type ToolTextResult = {
  content: Array<{ type: "text"; text: string }>;
};

/**
 * RQ-3025: turn a non-2xx response into a status-only message for the LLM and
 * send the full body to stderr for operators.
 */
export async function apiErrorResult(
  action: string,
  response: Response
): Promise<ToolTextResult> {
  let rawBody: string;
  try {
    rawBody = await response.text();
  } catch {
    rawBody = "<response body could not be read>";
  }
  console.error(
    `[requestly-mcp] ${action} failed: HTTP ${response.status} ${response.statusText} :: ${rawBody}`
  );
  return {
    content: [
      {
        type: "text",
        text: `Failed to ${action}: API error (status ${response.status}).`,
      },
    ],
  };
}
