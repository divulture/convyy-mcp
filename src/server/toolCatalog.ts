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
      name: "convyy_pages",
      title: "Pages",
      description:
        "Manage board pages: list available pages, create a new one, or switch the active page. " +
        "Returns pages, the active page id and the current session binding.",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "create", "switch"] },
          name: { type: "string", description: "Page name for action 'create'." },
          pageId: { type: "string", description: "Target page id for action 'switch'." },
          boardId: { type: "string" },
          sessionId: { type: "string" },
        },
        required: ["action"],
        additionalProperties: false,
      },
    },
    {
      name: "convyy_analyze",
      title: "Analyze Canvas",
      description:
        "Read the canvas and return a text summary. Scope: image (images on the page), page (the whole " +
        "page), or selection. Does not modify the board.",
      inputSchema: {
        type: "object",
        properties: {
          scope: { type: "string", enum: ["image", "page", "selection"] },
          pageId: { type: "string" },
          boardId: { type: "string" },
          sessionId: { type: "string" },
        },
        required: ["scope"],
        additionalProperties: false,
      },
    },
    {
      name: "convyy_revert",
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
  ];
}
