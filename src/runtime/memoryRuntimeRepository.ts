import type { McpRuntimeRepository } from "../contracts/runtimeRepository";
import type { McpRuntimeState } from "./mcpRuntimeState";

export function createMemoryRuntimeRepository(): McpRuntimeRepository {
  const states = new Map<string, McpRuntimeState>();

  return {
    async load(boardId) {
      return states.get(boardId) ?? null;
    },
    async save(state) {
      states.set(state.boardId, {
        boardId: state.boardId,
        activeGenerationSessionId: state.activeGenerationSessionId,
        bindings: state.bindings.map((binding) => ({ ...binding })),
      });
    },
  };
}
