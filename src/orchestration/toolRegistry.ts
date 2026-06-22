import type { McpToolDefinition } from "../contracts/tool";

export interface McpToolRegistry {
  listTools(): ReadonlyArray<McpToolDefinition>;
  resolveTool(prompt: string): McpToolDefinition | null;
}

export function createStaticToolRegistry(tools: ReadonlyArray<McpToolDefinition>): McpToolRegistry {
  const stableTools = [...tools];

  return {
    listTools() {
      return stableTools;
    },
    resolveTool(prompt) {
      return stableTools.find((tool) => tool.supports(prompt)) ?? null;
    },
  };
}
