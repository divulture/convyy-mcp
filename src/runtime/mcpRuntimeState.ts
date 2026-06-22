export type McpSessionId = string;
export type McpGenerationStatus = "idle" | "running";

export interface McpChatSessionBinding {
  chatId: string;
  currentPageId: string | null;
  lastBatchId: string | null;
  lastBoundAt: number;
}

export interface McpRuntimeState {
  boardId: string;
  activeGenerationChatId: string | null;
  bindings: McpChatSessionBinding[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeBinding(value: unknown): McpChatSessionBinding | null {
  if (!isRecord(value) || typeof value.chatId !== "string" || typeof value.lastBoundAt !== "number") {
    return null;
  }

  const currentPageId =
    value.currentPageId === null || typeof value.currentPageId === "string" ? value.currentPageId : null;
  const lastBatchId = value.lastBatchId === null || typeof value.lastBatchId === "string" ? value.lastBatchId : null;

  return {
    chatId: value.chatId,
    currentPageId,
    lastBatchId,
    lastBoundAt: value.lastBoundAt,
  };
}

export function createEmptyMcpRuntimeState(boardId: string): McpRuntimeState {
  return {
    boardId,
    activeGenerationChatId: null,
    bindings: [],
  };
}

export function normalizeMcpRuntimeState(boardId: string, value: unknown): McpRuntimeState {
  if (!isRecord(value)) {
    return createEmptyMcpRuntimeState(boardId);
  }

  const bindings = Array.isArray(value.bindings)
    ? value.bindings.map(normalizeBinding).filter((binding): binding is McpChatSessionBinding => binding !== null)
    : [];

  return {
    boardId,
    activeGenerationChatId:
      value.activeGenerationChatId === null || typeof value.activeGenerationChatId === "string"
        ? value.activeGenerationChatId
        : null,
    bindings,
  };
}

export function serializeMcpRuntimeState(state: McpRuntimeState): string {
  return JSON.stringify({
    activeGenerationChatId: state.activeGenerationChatId,
    bindings: state.bindings.map((binding) => ({
      chatId: binding.chatId,
      currentPageId: binding.currentPageId,
      lastBatchId: binding.lastBatchId,
      lastBoundAt: binding.lastBoundAt,
    })),
  });
}
