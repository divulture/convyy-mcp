import type { McpSessionBinding, McpRuntimeState } from "../runtime/mcpRuntimeState";

export interface StartGenerationResult {
  ok: boolean;
  reason: "started" | "already-running";
}

export interface McpSessionMachine {
  getState(): McpRuntimeState;
  bindSession(sessionId: string, pageId: string | null, lastBatchId?: string | null): void;
  setLastBatchId(sessionId: string, lastBatchId: string | null): void;
  startGeneration(sessionId: string): StartGenerationResult;
  finishGeneration(sessionId: string): void;
}

function upsertBinding(
  bindings: ReadonlyArray<McpSessionBinding>,
  nextBinding: McpSessionBinding,
): McpSessionBinding[] {
  const index = bindings.findIndex((binding) => binding.sessionId === nextBinding.sessionId);
  if (index === -1) {
    return [...bindings, nextBinding];
  }

  return bindings.map((binding, bindingIndex) => (bindingIndex === index ? nextBinding : binding));
}

export function createMcpSessionMachine(initialState: McpRuntimeState): McpSessionMachine {
  let state: McpRuntimeState = {
    boardId: initialState.boardId,
    activeGenerationSessionId: initialState.activeGenerationSessionId,
    bindings: [...initialState.bindings],
  };

  return {
    getState() {
      return state;
    },

    bindSession(sessionId, pageId, lastBatchId = null) {
      state = {
        ...state,
        bindings: upsertBinding(state.bindings, {
          sessionId,
          currentPageId: pageId,
          lastBatchId,
          lastBoundAt: Date.now(),
        }),
      };
    },

    setLastBatchId(sessionId, lastBatchId) {
      const existing = state.bindings.find((binding: McpSessionBinding) => binding.sessionId === sessionId);
      if (!existing) {
        return;
      }

      state = {
        ...state,
        bindings: upsertBinding(state.bindings, {
          ...existing,
          lastBatchId,
        }),
      };
    },

    startGeneration(sessionId) {
      if (state.activeGenerationSessionId !== null && state.activeGenerationSessionId !== sessionId) {
        return { ok: false, reason: "already-running" };
      }

      state = {
        ...state,
        activeGenerationSessionId: sessionId,
      };
      return { ok: true, reason: "started" };
    },

    finishGeneration(sessionId) {
      if (state.activeGenerationSessionId !== sessionId) {
        return;
      }

      state = {
        ...state,
        activeGenerationSessionId: null,
      };
    },
  };
}
