import type { McpRuntimeState } from "../runtime/mcpRuntimeState";

export interface McpRuntimeRepository {
  load(boardId: string): Promise<McpRuntimeState | null>;
  save(state: McpRuntimeState): Promise<void>;
}
