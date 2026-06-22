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
}

export interface McpToolExecutionResult {
  toolId: string;
  summary: string;
  title?: string;
  notes?: ReadonlyArray<string>;
  payload: unknown;
}
