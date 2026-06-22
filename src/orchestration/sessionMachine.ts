import type { McpChatSessionBinding, McpRuntimeState } from "../runtime/mcpRuntimeState";

export interface StartGenerationResult {
  ok: boolean;
  reason: "started" | "already-running";
}

export interface McpSessionMachine {
  getState(): McpRuntimeState;
  bindChat(chatId: string, pageId: string | null, lastBatchId?: string | null): void;
  setLastBatchId(chatId: string, lastBatchId: string | null): void;
  startGeneration(chatId: string): StartGenerationResult;
  finishGeneration(chatId: string): void;
}

function upsertBinding(
  bindings: ReadonlyArray<McpChatSessionBinding>,
  nextBinding: McpChatSessionBinding,
): McpChatSessionBinding[] {
  const index = bindings.findIndex((binding) => binding.chatId === nextBinding.chatId);
  if (index === -1) {
    return [...bindings, nextBinding];
  }

  return bindings.map((binding, bindingIndex) => (bindingIndex === index ? nextBinding : binding));
}

export function createMcpSessionMachine(initialState: McpRuntimeState): McpSessionMachine {
  let state: McpRuntimeState = {
    boardId: initialState.boardId,
    activeGenerationChatId: initialState.activeGenerationChatId,
    bindings: [...initialState.bindings],
  };

  return {
    getState() {
      return state;
    },

    bindChat(chatId, pageId, lastBatchId = null) {
      state = {
        ...state,
        bindings: upsertBinding(state.bindings, {
          chatId,
          currentPageId: pageId,
          lastBatchId,
          lastBoundAt: Date.now(),
        }),
      };
    },

    setLastBatchId(chatId, lastBatchId) {
      const existing = state.bindings.find((binding: McpChatSessionBinding) => binding.chatId === chatId);
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

    startGeneration(chatId) {
      if (state.activeGenerationChatId !== null && state.activeGenerationChatId !== chatId) {
        return { ok: false, reason: "already-running" };
      }

      state = {
        ...state,
        activeGenerationChatId: chatId,
      };
      return { ok: true, reason: "started" };
    },

    finishGeneration(chatId) {
      if (state.activeGenerationChatId !== chatId) {
        return;
      }

      state = {
        ...state,
        activeGenerationChatId: null,
      };
    },
  };
}
