export type McpFollowUpActionType = "append" | "replace-last-batch" | "undo-last-batch" | "new-page" | "bind-page";

export interface McpFollowUpAction {
  type: McpFollowUpActionType;
  targetPageId?: string;
  targetPageName?: string | null;
}

export interface McpToolExecutionContext {
  sessionId: string;
  prompt: string;
  locale?: "ru" | "en";
  boundPageId: string | null;
  boundPageName: string | null;
  /**
   * Raw tool-call arguments from the MCP client. When the agent supplies
   * structured content (e.g. `convyy_draw` `elements`), tools render that
   * directly instead of falling back to a prompt-derived template.
   */
  args?: Record<string, unknown> | null;
}

export interface McpToolExecutionResult {
  toolId: string;
  summary: string;
  title?: string;
  notes?: ReadonlyArray<string>;
  payload: unknown;
}
