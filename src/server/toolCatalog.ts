import type { McpToolDefinition } from "../contracts/tool";

export const DEFAULT_RUNTIME_BOARD_ID = "active-board";
export const DEFAULT_RUNTIME_SESSION_ID = "default-session";

export function buildMcpToolsList(tools: ReadonlyArray<McpToolDefinition>) {
  return [
    ...tools.map((tool) => ({
      name: tool.id,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
    {
      name: "convyy_run_prompt",
      title: "Run Prompt",
      description: "Resolve follow-up action, select a tool, and commit a board-ready AI batch through the active board runtime.",
      inputSchema: {
        type: "object",
        properties: {
          boardId: { type: "string" },
          sessionId: { type: "string" },
          prompt: { type: "string" },
          locale: { type: "string", enum: ["ru", "en"] },
          pageId: { type: ["string", "null"] },
          toolId: { type: ["string", "null"] },
        },
        required: ["prompt"],
        additionalProperties: false,
      },
    },
    {
      name: "convyy_bind_session",
      title: "Bind Session To Page",
      description: "Bind the active runtime session to a specific page.",
      inputSchema: {
        type: "object",
        properties: {
          boardId: { type: "string" },
          sessionId: { type: "string" },
          pageId: { type: "string" },
        },
        required: ["pageId"],
        additionalProperties: false,
      },
    },
    {
      name: "convyy_list_pages",
      title: "List Pages",
      description: "List pages provided by the active board runtime.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "convyy_revert_last_batch",
      title: "Revert Last Batch",
      description: "Revert the last AI batch of the active runtime session.",
      inputSchema: {
        type: "object",
        properties: {
          boardId: { type: "string" },
          sessionId: { type: "string" },
        },
        additionalProperties: false,
      },
    },
    {
      name: "convyy_get_runtime_state",
      title: "Get Runtime State",
      description: "Inspect the current MCP runtime state for the active board runtime.",
      inputSchema: {
        type: "object",
        properties: {
          boardId: { type: "string" },
        },
        additionalProperties: false,
      },
    },
  ];
}
