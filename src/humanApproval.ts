import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * RQ-3008: approval that only the human can give.
 *
 * A `confirm: true` tool argument is supplied by the model, so a prompt-injected
 * model can approve its own destructive call. Instead, the server asks the person
 * directly through the host with an MCP elicitation request. The request goes from
 * this server to the host and its answer comes back here; it never passes through
 * the model, so the model cannot answer it.
 *
 * Anything other than an explicit "accept" counts as "no":
 * decline, cancel, a timeout, an error, or a host that does not support elicitation.
 */

export type ApprovalOutcome =
  | { approved: true }
  | { approved: false; reason: "unsupported" | "declined" | "cancelled" | "failed" };

/** How long the person has to answer before the action is refused. */
export const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

export async function askHumanToApprove(
  server: McpServer,
  message: string,
  options: { relatedRequestId?: string | number } = {}
): Promise<ApprovalOutcome> {
  if (!server.server.getClientCapabilities()?.elicitation?.form) {
    return { approved: false, reason: "unsupported" };
  }
  try {
    const result = await server.server.elicitInput(
      {
        mode: "form",
        message,
        // No form fields: the host shows the message with Accept / Decline, and
        // Accept itself is the approval. (A checkbox on top of Accept was a
        // redundant second step.)
        requestedSchema: { type: "object", properties: {} },
      },
      { timeout: APPROVAL_TIMEOUT_MS, relatedRequestId: options.relatedRequestId }
    );
    if (result.action === "accept") {
      return { approved: true };
    }
    return { approved: false, reason: result.action === "cancel" ? "cancelled" : "declined" };
  } catch (error) {
    console.error("Human approval request failed:", error);
    return { approved: false, reason: "failed" };
  }
}

/** Tool result text for a refused destructive action. Never suggests retrying on the user's behalf. */
export function notApprovedText(what: string, reason: Exclude<ApprovalOutcome, { approved: true }>["reason"]): string {
  switch (reason) {
    case "unsupported":
      return (
        `Not deleted: ${what}. This MCP host can't ask the user to approve a delete ` +
        `(it doesn't support MCP elicitation). The user can delete it in the Requestly app: ` +
        `https://app.requestly.io/rules/my-rules`
      );
    case "declined":
    case "cancelled":
      return `Not deleted: the user did not approve deleting ${what}. Do not retry unless the user asks again.`;
    case "failed":
      return `Not deleted: the approval request for ${what} failed or timed out. Nothing was changed.`;
  }
}
