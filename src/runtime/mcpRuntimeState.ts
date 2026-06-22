export type McpSessionId = string;
export type McpGenerationStatus = "idle" | "running";

export interface McpSessionBinding {
  sessionId: string;
  currentPageId: string | null;
  lastBatchId: string | null;
  lastBoundAt: number;
}

export interface McpRuntimeState {
  boardId: string;
  activeGenerationSessionId: string | null;
  bindings: McpSessionBinding[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeBinding(value: unknown): McpSessionBinding | null {
  const sessionId = isRecord(value) && typeof value.sessionId === "string" ? value.sessionId : null;
  if (!isRecord(value) || !sessionId || typeof value.lastBoundAt !== "number") {
    return null;
  }

  const currentPageId =
    value.currentPageId === null || typeof value.currentPageId === "string" ? value.currentPageId : null;
  const lastBatchId = value.lastBatchId === null || typeof value.lastBatchId === "string" ? value.lastBatchId : null;

  return {
    sessionId,
    currentPageId,
    lastBatchId,
    lastBoundAt: value.lastBoundAt,
  };
}

export function createEmptyMcpRuntimeState(boardId: string): McpRuntimeState {
  return {
    boardId,
    activeGenerationSessionId: null,
    bindings: [],
  };
}

export function normalizeMcpRuntimeState(boardId: string, value: unknown): McpRuntimeState {
  if (!isRecord(value)) {
    return createEmptyMcpRuntimeState(boardId);
  }

  const bindings = Array.isArray(value.bindings)
    ? value.bindings.map(normalizeBinding).filter((binding): binding is McpSessionBinding => binding !== null)
    : [];

  return {
    boardId,
    activeGenerationSessionId:
      value.activeGenerationSessionId === null || typeof value.activeGenerationSessionId === "string"
        ? value.activeGenerationSessionId
        : null,
    bindings,
  };
}

export function serializeMcpRuntimeState(state: McpRuntimeState): string {
  return JSON.stringify({
    activeGenerationSessionId: state.activeGenerationSessionId,
    bindings: state.bindings.map((binding) => ({
      sessionId: binding.sessionId,
      currentPageId: binding.currentPageId,
      lastBatchId: binding.lastBatchId,
      lastBoundAt: binding.lastBoundAt,
    })),
  });
}
