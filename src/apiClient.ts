import { z } from "zod";

// RQ-3018: resource ids come from the LLM and are interpolated into the request
// path, so they must be encoded — `../groups/X` would otherwise resolve to a
// cross-resource write. RQ-3025: upstream error bodies must never reach the LLM;
// anything able to shape one owns a prompt-injection channel into the model.

export const REQUESTLY_API_BASE = "https://api2.requestly.io/v1";

export const RESOURCE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export const resourceIdSchema = z
  .string()
  .regex(
    RESOURCE_ID_PATTERN,
    "Invalid id: only letters, digits, underscore and hyphen are allowed."
  );

export type ResourceCollection = "rules" | "groups";

export function buildResourceUrl(
  collection: ResourceCollection,
  id: string
): string {
  const prefix = `${REQUESTLY_API_BASE}/${collection}/`;
  const url = `${prefix}${encodeURIComponent(id)}`;
  // Unreachable while the id is encoded; asserted so a refactor that drops the
  // encoding fails loudly instead of silently reopening the traversal.
  if (!url.startsWith(prefix)) {
    throw new Error("Resolved request URL left its expected base path.");
  }
  return url;
}

export type ToolTextResult = {
  content: Array<{ type: "text"; text: string }>;
};

/** Status-only for the LLM; full body to stderr, where operators can see it. */
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
