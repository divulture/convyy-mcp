import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runConvyyMcpDevRelay } from "./dev/devRelayServer";
import type { McpHostAdapter, McpPageContext, McpPageSummary, McpPlacementZone } from "./contracts/hostAdapter";
import type { McpRuntimeRepository } from "./contracts/runtimeRepository";
import type { JsonRpcRequest, JsonRpcResponse } from "./server/mcpProtocol";
import { createJsonRpcError, createJsonRpcResult } from "./server/mcpProtocol";
import { createStdioMessageReader, writeFramedJsonRpcMessage } from "./server/stdioTransport";
import { createConvyyMcpService } from "./application/convyyMcpService";
import { createMemoryRuntimeRepository } from "./runtime/memoryRuntimeRepository";
import { createDefaultTools } from "./tools/defaultTools";
import { buildMcpToolsList, DEFAULT_RUNTIME_BOARD_ID, DEFAULT_RUNTIME_SESSION_ID } from "./server/toolCatalog";

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
            tools: buildMcpToolsList(tools),
          });
        }

        if (request.method === "tools/call") {
          const toolName = asString(params.name);
          const args = isRecord(params.arguments) ? params.arguments : {};

          if (!toolName) {
            return createJsonRpcError(id, -32602, "Tool name is required.");
          }

          if (toolName === "convyy_pages") {
            const boardId = asString(args.boardId) ?? DEFAULT_RUNTIME_BOARD_ID;
            const sessionId = asString(args.sessionId) ?? DEFAULT_RUNTIME_SESSION_ID;
            const rawAction = asString(args.action);
            const action = rawAction === "create" || rawAction === "switch" ? rawAction : "list";
            const result = await service.pages(boardId, sessionId, action, asNullableString(args.name), asNullableString(args.pageId));
            return createJsonRpcResult(id, buildTextToolResponse(result, `Returned ${result.pages.length} page(s).`));
          }

          if (toolName === "convyy_revert") {
            const boardId = asString(args.boardId) ?? DEFAULT_RUNTIME_BOARD_ID;
            const sessionId = asString(args.sessionId) ?? DEFAULT_RUNTIME_SESSION_ID;

            const result = await service.revertLastBatch(boardId, sessionId);
            return createJsonRpcResult(id, buildTextToolResponse(result, result.reverted ? "Reverted last AI batch." : "No AI batch was reverted."));
          }

          if (toolName === "convyy_analyze") {
            const boardId = asString(args.boardId) ?? DEFAULT_RUNTIME_BOARD_ID;
            const sessionId = asString(args.sessionId) ?? DEFAULT_RUNTIME_SESSION_ID;
            const rawScope = asString(args.scope);
            const scope = rawScope === "image" || rawScope === "selection" ? rawScope : "page";
            const result = await service.analyze(boardId, sessionId, scope, asNullableString(args.pageId));
            return createJsonRpcResult(id, buildTextToolResponse(result, result.summary));
          }

          // Content tools (convyy_draw, convyy_apply_template) route through the
          // internal runPrompt engine so the agent-provided structure is committed
          // to the board. run_prompt is no longer a public tool; this is its engine.
          const directTool = tools.find((tool) => tool.id === toolName);
          if (!directTool) {
            return createJsonRpcError(id, -32601, `Unknown tool: ${toolName}`);
          }

          const prompt = asString(args.prompt);
          if (!prompt) {
            return createJsonRpcError(id, -32602, "prompt is required.");
          }

          const result = await service.runPrompt({
            boardId: asString(args.boardId) ?? DEFAULT_RUNTIME_BOARD_ID,
            sessionId: asString(args.sessionId) ?? DEFAULT_RUNTIME_SESSION_ID,
            prompt,
            locale: (asString(args.locale) as "ru" | "en" | null) ?? "en",
            pageId: asNullableString(args.pageId),
            toolId: toolName,
            args,
          });

          return createJsonRpcResult(id, buildTextToolResponse(result, `Committed ${result.toolId} on page ${result.page.name}.`));
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
  const useLocalMode = args.includes("--local");
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
    nodeProcess.process?.stdout.write("Usage: convyy-mcp [--host 127.0.0.1] [--port 4318] [--timeout 15000] [--local] [--demo] [--manifest] [--help]\n");
    return 0;
  }

  if (!useLocalMode) {
    const hostArg = args.indexOf("--host");
    const portArg = args.indexOf("--port");
    const timeoutArg = args.indexOf("--timeout");
    const host = hostArg >= 0 ? args[hostArg + 1] ?? "127.0.0.1" : "127.0.0.1";
    const port = Number.parseInt(portArg >= 0 ? args[portArg + 1] ?? "4318" : "4318", 10);
    const timeoutMs = Number.parseInt(timeoutArg >= 0 ? args[timeoutArg + 1] ?? "15000" : "15000", 10);

    runConvyyMcpDevRelay({
      host,
      port: Number.isFinite(port) ? port : 4318,
      requestTimeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 15000,
    });
    return null;
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
