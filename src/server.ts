import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { McpHostAdapter, McpPageContext, McpPageSummary, McpPlacementZone } from "./contracts/hostAdapter";
import type { McpRuntimeRepository } from "./contracts/runtimeRepository";
import type { JsonRpcRequest, JsonRpcResponse } from "./server/mcpProtocol";
import { createJsonRpcError, createJsonRpcResult } from "./server/mcpProtocol";
import { createStdioMessageReader, writeFramedJsonRpcMessage } from "./server/stdioTransport";
import { createConvyyMcpService } from "./application/convyyMcpService";
import { createMemoryRuntimeRepository } from "./runtime/memoryRuntimeRepository";
import { createDefaultTools } from "./tools/defaultTools";

const nodeProcess = globalThis as typeof globalThis & {
  process?: {
    stdout: { write: (chunk: unknown) => void };
    stdin: { on: (event: string, callback: (chunk: Uint8Array) => void) => void };
    exit: (code?: number) => never;
    argv: string[];
  };
};

export interface ConvyyMcpServer {
  handleMessage(message: unknown): Promise<JsonRpcResponse | null>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNullableString(value: unknown): string | null {
  return value === null || typeof value === "string" ? value : null;
}

function buildTextToolResponse(data: unknown, summary: string, isError = false) {
  return {
    content: [{ type: "text", text: summary }],
    structuredContent: data,
    isError,
  };
}

function createUnavailableHostAdapter(): McpHostAdapter {
  const fail = async (): Promise<never> => {
    throw new Error("No host adapter was provided. Inject a Convyy host adapter to use the MCP server.");
  };

  return {
    listPages: fail,
    createPage: fail,
    getPageContext: fail,
    resolvePlacement: fail,
    commitBatch: fail,
    revertLastBatch: fail,
    loadVisionAssets: fail,
  };
}

export function createConvyyMcpServer(input?: { adapter?: McpHostAdapter; runtimeRepository?: McpRuntimeRepository }): ConvyyMcpServer {
  const tools = createDefaultTools();
  const service = createConvyyMcpService({
    adapter: input?.adapter ?? createUnavailableHostAdapter(),
    runtimeRepository: input?.runtimeRepository ?? createMemoryRuntimeRepository(),
    tools,
  });

  return {
    async handleMessage(message) {
      if (!isRecord(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
        return createJsonRpcError(null, -32600, "Invalid Request");
      }

      const request = message as unknown as JsonRpcRequest;
      const id = request.id ?? null;
      const params = isRecord(request.params) ? request.params : {};

      try {
        if (request.method === "initialize") {
          return createJsonRpcResult(id, {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {
                listChanged: false,
              },
            },
            serverInfo: {
              name: "@convyy/mcp",
              version: "0.1.0",
            },
          });
        }

        if (request.method === "notifications/initialized") {
          return null;
        }

        if (request.method === "ping") {
          return createJsonRpcResult(id, {});
        }

        if (request.method === "tools/list") {
          return createJsonRpcResult(id, {
            tools: [
              ...tools.map((tool) => ({
                name: tool.id,
                title: tool.title,
                description: tool.description,
                inputSchema: tool.inputSchema,
              })),
              {
                name: "convyy_run_prompt",
                title: "Run Prompt",
                description: "Resolve follow-up action, select a tool, and commit a board-ready AI batch through the host adapter.",
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
                  required: ["boardId", "sessionId", "prompt"],
                  additionalProperties: false,
                },
              },
              {
                name: "convyy_bind_session",
                title: "Bind Session To Page",
                description: "Bind a runtime session to a specific page.",
                inputSchema: {
                  type: "object",
                  properties: {
                    boardId: { type: "string" },
                    sessionId: { type: "string" },
                    pageId: { type: "string" },
                  },
                  required: ["boardId", "sessionId", "pageId"],
                  additionalProperties: false,
                },
              },
              {
                name: "convyy_list_pages",
                title: "List Pages",
                description: "List pages provided by the host adapter.",
                inputSchema: {
                  type: "object",
                  properties: {},
                  additionalProperties: false,
                },
              },
              {
                name: "convyy_revert_last_batch",
                title: "Revert Last Batch",
                description: "Revert the last AI batch of a given runtime session.",
                inputSchema: {
                  type: "object",
                  properties: {
                    boardId: { type: "string" },
                    sessionId: { type: "string" },
                  },
                  required: ["boardId", "sessionId"],
                  additionalProperties: false,
                },
              },
              {
                name: "convyy_get_runtime_state",
                title: "Get Runtime State",
                description: "Inspect the current MCP runtime state for a board.",
                inputSchema: {
                  type: "object",
                  properties: {
                    boardId: { type: "string" },
                  },
                  required: ["boardId"],
                  additionalProperties: false,
                },
              },
            ],
          });
        }

        if (request.method === "tools/call") {
          const toolName = asString(params.name);
          const args = isRecord(params.arguments) ? params.arguments : {};

          if (!toolName) {
            return createJsonRpcError(id, -32602, "Tool name is required.");
          }

          if (toolName === "convyy_list_pages") {
            const pages = await service.listPages();
            return createJsonRpcResult(id, buildTextToolResponse({ pages }, `Returned ${pages.length} page(s).`));
          }

          if (toolName === "convyy_bind_session") {
            const boardId = asString(args.boardId);
            const sessionId = asString(args.sessionId);
            const pageId = asString(args.pageId);
            if (!boardId || !sessionId || !pageId) {
              return createJsonRpcError(id, -32602, "boardId, sessionId, and pageId are required.");
            }

            const result = await service.bindSession(boardId, sessionId, pageId);
            return createJsonRpcResult(id, buildTextToolResponse(result, `Bound session ${sessionId} to page ${result.page.name}.`));
          }

          if (toolName === "convyy_get_runtime_state") {
            const boardId = asString(args.boardId);
            if (!boardId) {
              return createJsonRpcError(id, -32602, "boardId is required.");
            }

            const state = await service.getRuntimeState(boardId);
            return createJsonRpcResult(id, buildTextToolResponse(state, "Returned runtime state."));
          }

          if (toolName === "convyy_revert_last_batch") {
            const boardId = asString(args.boardId);
            const sessionId = asString(args.sessionId);
            if (!boardId || !sessionId) {
              return createJsonRpcError(id, -32602, "boardId and sessionId are required.");
            }

            const result = await service.revertLastBatch(boardId, sessionId);
            return createJsonRpcResult(id, buildTextToolResponse(result, result.reverted ? "Reverted last AI batch." : "No AI batch was reverted."));
          }

          if (toolName === "convyy_run_prompt") {
            const boardId = asString(args.boardId);
            const sessionId = asString(args.sessionId);
            const prompt = asString(args.prompt);
            const locale = asString(args.locale) as "ru" | "en" | null;
            const pageId = asNullableString(args.pageId);
            const directToolId = asNullableString(args.toolId);

            if (!boardId || !sessionId || !prompt) {
              return createJsonRpcError(id, -32602, "boardId, sessionId, and prompt are required.");
            }

            const result = await service.runPrompt({
              boardId,
              sessionId,
              prompt,
              locale: locale ?? "en",
              pageId,
              toolId: directToolId,
            });

            return createJsonRpcResult(id, buildTextToolResponse(result, `Committed ${result.toolId} on page ${result.page.name}.`));
          }

          const directTool = tools.find((tool) => tool.id === toolName);
          if (!directTool) {
            return createJsonRpcError(id, -32601, `Unknown tool: ${toolName}`);
          }

          const prompt = asString(args.prompt);
          if (!prompt) {
            return createJsonRpcError(id, -32602, "prompt is required.");
          }

          const result = await directTool.execute({
            sessionId: asString(args.sessionId) ?? "tool-call",
            prompt,
            locale: (asString(args.locale) as "ru" | "en" | null) ?? "en",
            boundPageId: asNullableString(args.pageId),
            boundPageName: asNullableString(args.pageName),
          });

          return createJsonRpcResult(id, buildTextToolResponse(result.payload, result.summary));
        }

        return createJsonRpcError(id, -32601, `Method not found: ${request.method}`);
      } catch (error) {
        return createJsonRpcError(id, -32000, error instanceof Error ? error.message : "Internal MCP server error.");
      }
    },
  };
}

function createDemoHostAdapter(): McpHostAdapter {
  const pages = new Map<string, McpPageSummary>([["page-1", { id: "page-1", name: "AI Page" }]]);
  let lastBatchId: string | null = null;
  let pageCounter = 1;

  return {
    async listPages() {
      return Array.from(pages.values());
    },
    async createPage(name) {
      pageCounter += 1;
      const page = { id: `page-${pageCounter}`, name };
      pages.set(page.id, page);
      return page;
    },
    async getPageContext(pageId) {
      const page = pages.get(pageId);
      if (!page) {
        return null;
      }
      return {
        pageId: page.id,
        pageName: page.name,
        summary: `Demo page context for ${page.name}.`,
        objectCount: 0,
        imageCount: 0,
      } satisfies McpPageContext;
    },
    async resolvePlacement() {
      return {
        x: 80,
        y: 80,
        width: 960,
        height: 540,
      } satisfies McpPlacementZone;
    },
    async commitBatch(input) {
      lastBatchId = `${input.toolId}-${Date.now()}`;
      return {
        batchId: lastBatchId,
        pageId: input.pageId,
      };
    },
    async revertLastBatch() {
      const existed = lastBatchId !== null;
      lastBatchId = null;
      return existed;
    },
    async loadVisionAssets() {
      return [];
    },
  };
}

export function runCli(args: ReadonlyArray<string>): number | null {
  const useDemoHost = args.includes("--demo");
  const server = createConvyyMcpServer({
    adapter: useDemoHost ? createDemoHostAdapter() : undefined,
  });

  if (args.includes("--manifest")) {
    server
      .handleMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      })
      .then((response) => {
        nodeProcess.process?.stdout.write(`${JSON.stringify(response?.result ?? {}, null, 2)}\n`);
      });
    return 0;
  }

  if (args.includes("--help")) {
    nodeProcess.process?.stdout.write("Usage: convyy-mcp [--demo] [--manifest] [--help]\n");
    return 0;
  }

  createStdioMessageReader(async (payload) => {
    const response = await server.handleMessage(payload);
    if (response) {
      writeFramedJsonRpcMessage(response);
    }
  });

  return null;
}

const entrypointArg = nodeProcess.process?.argv[1];
const entrypointUrl = entrypointArg ? pathToFileURL(resolve(entrypointArg)).href : null;

if (entrypointUrl !== null && import.meta.url === entrypointUrl) {
  const exitCode = runCli(nodeProcess.process?.argv.slice(2) ?? []);
  if (typeof exitCode === "number") {
    nodeProcess.process?.exit(exitCode);
  }
}
