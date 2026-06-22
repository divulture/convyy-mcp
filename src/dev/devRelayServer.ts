import http from "node:http";

import { createDefaultTools } from "../tools/defaultTools";
import type { JsonRpcRequest, JsonRpcResponse } from "../server/mcpProtocol";
import { createJsonRpcError, createJsonRpcResult } from "../server/mcpProtocol";
import { createStdioMessageReader, writeFramedJsonRpcMessage } from "../server/stdioTransport";
import { buildMcpToolsList } from "../server/toolCatalog";
import type { RelayPullResponse, RelayPushRequest } from "./relayProtocol";
import { createRelayQueue } from "./relayQueue";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJsonBody(rawBody: string): unknown {
  if (!rawBody) {
    return null;
  }
  return JSON.parse(rawBody) as unknown;
}

function readRequestBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let rawBody = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      rawBody += chunk;
    });
    request.on("end", () => resolve(rawBody));
    request.on("error", (error) => reject(error));
  });
}

function writeJson(response: http.ServerResponse, statusCode: number, payload: unknown) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body, "utf8"),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(body);
}

export interface ConvyyMcpDevRelayOptions {
  host?: string;
  port?: number;
  requestTimeoutMs?: number;
}

export function runConvyyMcpDevRelay(options: ConvyyMcpDevRelayOptions = {}): http.Server {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4318;
  const requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
  const relayQueue = createRelayQueue();
  const tools = createDefaultTools();

  const server = http.createServer(async (request, response) => {
    if (!request.url || !request.method) {
      writeJson(response, 404, { error: "Not found" });
      return;
    }

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      });
      response.end();
      return;
    }

    if (request.method === "GET" && request.url === "/health") {
      writeJson(response, 200, {
        ok: true,
        pendingCount: relayQueue.pendingCount(),
      });
      return;
    }

    if (request.method === "GET" && request.url === "/browser/pull") {
      const payload: RelayPullResponse = {
        request: relayQueue.pull(),
      };
      writeJson(response, 200, payload);
      return;
    }

    if (request.method === "POST" && request.url === "/browser/push") {
      try {
        const body = parseJsonBody(await readRequestBody(request));
        if (!isRecord(body) || typeof body.relayRequestId !== "string") {
          writeJson(response, 400, { ok: false, error: "Invalid relay push body." });
          return;
        }

        const accepted = relayQueue.resolve(
          body.relayRequestId,
          (body.response as JsonRpcResponse | null | undefined) ?? null,
        );
        writeJson(response, 200, { ok: accepted });
      } catch (error) {
        writeJson(response, 500, {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown bridge push error.",
        });
      }
      return;
    }

    writeJson(response, 404, { error: "Not found" });
  });

  server.listen(port, host);

  createStdioMessageReader(async (payload) => {
    if (!isRecord(payload) || payload.jsonrpc !== "2.0" || typeof payload.method !== "string") {
      writeFramedJsonRpcMessage(createJsonRpcError(null, -32600, "Invalid Request"));
      return;
    }

    const request = payload as unknown as JsonRpcRequest;

    if (request.method === "initialize") {
      writeFramedJsonRpcMessage(createJsonRpcResult(request.id ?? null, {
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
      }));
      return;
    }

    if (request.method === "ping") {
      writeFramedJsonRpcMessage(createJsonRpcResult(request.id ?? null, {}));
      return;
    }

    if (request.method === "notifications/initialized") {
      return;
    }

    if (request.method === "tools/list") {
      writeFramedJsonRpcMessage(createJsonRpcResult(request.id ?? null, {
        tools: buildMcpToolsList(tools),
      }));
      return;
    }

    try {
      const result = await relayQueue.enqueue(request, requestTimeoutMs);
      if (result) {
        writeFramedJsonRpcMessage(result);
      }
    } catch (error) {
      writeFramedJsonRpcMessage(
        createJsonRpcError(
          request.id ?? null,
          -32000,
          error instanceof Error ? error.message : "Convyy dev bridge relay failed.",
        ),
      );
    }
  });

  return server;
}
