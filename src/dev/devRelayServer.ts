import http from "node:http";
import { randomUUID } from "node:crypto";
import fs from "node:fs";

import { createDefaultTools } from "../tools/defaultTools";
import type { JsonRpcRequest, JsonRpcResponse } from "../server/mcpProtocol";
import { createJsonRpcError, createJsonRpcResult } from "../server/mcpProtocol";
import { createStdioMessageReader, writeFramedJsonRpcMessage } from "../server/stdioTransport";
import { buildMcpToolsList } from "../server/toolCatalog";
import {
  CONVYY_RELAY_ALLOWED_HOSTS,
  CONVYY_RELAY_AGENT_TOKEN_HEADER,
  CONVYY_RELAY_CLIENT_ID_HEADER,
  CONVYY_RELAY_PROTOCOL_VERSION,
  CONVYY_RELAY_TOKEN_HEADER,
  getRelayAgentTokenPath,
  isAllowedRelayHost,
  isAllowedRelayOrigin,
  type RelayHandshakeRequest,
  type RelayHandshakeResponse,
  type RelayPullResponse,
} from "./relayProtocol";
import { createRelayQueue } from "./relayQueue";

const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024;

class PayloadTooLargeError extends Error {
  constructor() {
    super("Payload too large.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// Board responses to tools/call carry `structuredContent` but omit the
// MCP-required `content` field. Strict MCP clients (e.g. mcpo / the python
// `mcp` SDK) reject such a CallToolResult. Backfill a text `content` block so
// the relay path stays spec-compliant regardless of what the board sends.
function ensureToolResultContent(request: JsonRpcRequest, response: JsonRpcResponse): JsonRpcResponse {
  if (request.method !== "tools/call") {
    return response;
  }
  const result = (response as unknown as Record<string, unknown>).result;
  if (!isRecord(result) || Array.isArray(result.content)) {
    return response;
  }
  const structured = isRecord(result.structuredContent) ? result.structuredContent : null;
  const summary =
    structured && typeof structured.summary === "string"
      ? structured.summary
      : "Tool call completed.";
  return {
    ...response,
    result: {
      ...result,
      content: [{ type: "text", text: summary }],
      isError: typeof result.isError === "boolean" ? result.isError : false,
    },
  } as JsonRpcResponse;
}

function parseJsonBody(rawBody: string): unknown {
  if (!rawBody) {
    return null;
  }
  return JSON.parse(rawBody) as unknown;
}

function isPayloadTooLargeError(error: unknown): error is PayloadTooLargeError {
  return error instanceof PayloadTooLargeError;
}

function readRequestBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let rawBody = "";
    let size = 0;
    let settled = false;
    request.setEncoding("utf8");
    const cleanup = () => {
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("error", onError);
    };
    const onData = (chunk: string) => {
      if (settled) {
        return;
      }
      size += Buffer.byteLength(chunk, "utf8");
      if (size > MAX_REQUEST_BODY_BYTES) {
        settled = true;
        cleanup();
        request.resume();
        reject(new PayloadTooLargeError());
        return;
      }
      rawBody += chunk;
    };
    const onEnd = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(rawBody);
    };
    const onError = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };
    request.on("data", onData);
    request.on("end", onEnd);
    request.on("error", onError);
  });
}

function buildCorsHeaders(origin: string | undefined): http.OutgoingHttpHeaders {
  if (!origin || !isAllowedRelayOrigin(origin)) {
    return {};
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type, X-Convyy-Relay-Client-Id, X-Convyy-Relay-Token",
    "Access-Control-Allow-Private-Network": "true",
  };
}

function writeJson(
  response: http.ServerResponse,
  statusCode: number,
  payload: unknown,
  origin?: string,
) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body, "utf8"),
    ...buildCorsHeaders(origin),
  });
  response.end(body);
}

function readHandshakeRequest(body: unknown): RelayHandshakeRequest | null {
  if (
    !isRecord(body)
    || !isNonEmptyString(body.protocolVersion)
    || !isNonEmptyString(body.clientId)
    || !isNonEmptyString(body.boardId)
    || !isNonEmptyString(body.nonce)
  ) {
    return null;
  }

  return {
    protocolVersion: body.protocolVersion,
    clientId: body.clientId,
    boardId: body.boardId,
    nonce: body.nonce,
  };
}

/**
 * Forward a tool call to an already-running relay over HTTP. Used when this
 * process is NOT the relay owner (the port was already taken by another Convyy
 * MCP instance) — instead of crashing on EADDRINUSE, the process attaches to
 * the existing relay so multiple agents/projects can share one open board.
 */
export async function forwardAgentRequest(
  host: string,
  port: number,
  request: JsonRpcRequest,
  timeoutMs: number,
): Promise<JsonRpcResponse | null> {
  const tokenPath = getRelayAgentTokenPath(port);
  const agentToken = fs.readFileSync(tokenPath, "utf8").trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs + 2_000);
  try {
    const httpResponse = await fetch(`http://${host}:${port}/agent/request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [CONVYY_RELAY_AGENT_TOKEN_HEADER]: agentToken,
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    const payload = (await httpResponse.json()) as {
      ok?: boolean;
      response?: JsonRpcResponse | null;
      error?: string;
    };
    if (!payload || payload.ok !== true) {
      throw new Error(
        typeof payload?.error === "string"
          ? payload.error
          : `Convyy relay rejected the agent request (status ${httpResponse.status}).`,
      );
    }
    return payload.response ?? null;
  } finally {
    clearTimeout(timer);
  }
}

export interface ConvyyMcpDevRelayOptions {
  host?: string;
  port?: number;
  requestTimeoutMs?: number;
  sessionTtlMs?: number;
  maxSessions?: number;
  now?: () => number;
}

export function runConvyyMcpDevRelay(options: ConvyyMcpDevRelayOptions = {}): http.Server {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4318;
  const requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
  const sessionTtlMs = options.sessionTtlMs ?? 30 * 60 * 1000;
  const maxSessions = options.maxSessions ?? 50;
  const now = options.now ?? Date.now;
  const relayQueue = createRelayQueue();
  const tools = createDefaultTools();
  const relayInstanceId = randomUUID();
  const browserSessions = new Map<string, {
    boardId: string;
    sessionToken: string;
    expiresAt: number;
  }>();
  const tokenPath = getRelayAgentTokenPath(port);

  function pruneExpiredBrowserSessions(nowTs: number) {
    for (const [clientId, session] of browserSessions.entries()) {
      if (session.expiresAt <= nowTs) {
        browserSessions.delete(clientId);
      }
    }
  }

  function evictOldestBrowserSession() {
    let oldestClientId: string | null = null;
    let oldestExpiresAt = Number.POSITIVE_INFINITY;
    for (const [clientId, session] of browserSessions.entries()) {
      if (session.expiresAt < oldestExpiresAt) {
        oldestExpiresAt = session.expiresAt;
        oldestClientId = clientId;
      }
    }
    if (oldestClientId) {
      browserSessions.delete(oldestClientId);
    }
  }

  const proc = (globalThis as typeof globalThis & {
    process?: {
      stderr?: { write: (chunk: string) => void };
      stdin?: { on: (event: string, cb: () => void) => void };
      exit: (code?: number) => never;
    };
  }).process;

  let isOwner = false;
  let agentToken: string | null = null;
  // Captured from the MCP `initialize` handshake (clientInfo.name). The board
  // never sees `initialize` (it's answered locally below), so we capture the
  // agent name here and inject it into every relayed tool call for the cursor.
  let agentName: string | null = null;

  const server = http.createServer(async (request, response) => {
    if (!request.url || !request.method) {
      writeJson(response, 404, { error: "Not found" });
      return;
    }

    const origin = typeof request.headers.origin === "string" ? request.headers.origin : undefined;
    if (!isAllowedRelayOrigin(origin)) {
      writeJson(response, 403, { ok: false, error: "Origin not allowed." });
      return;
    }

    const hostHeader = typeof request.headers.host === "string" ? request.headers.host : undefined;
    if (!isAllowedRelayHost(hostHeader)) {
      writeJson(response, 403, {
        ok: false,
        error: `Host not allowed. Expected one of: ${CONVYY_RELAY_ALLOWED_HOSTS.join(", ")}.`,
      }, origin);
      return;
    }

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        ...buildCorsHeaders(origin),
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        // Chrome's Private Network Access requires this on the preflight when a
        // public HTTPS origin (the hosted board) calls a loopback relay.
        "Access-Control-Max-Age": "86400",
      });
      response.end();
      return;
    }

    if (request.method === "GET" && request.url === "/health") {
      writeJson(response, 200, {
        ok: true,
        protocolVersion: CONVYY_RELAY_PROTOCOL_VERSION,
        instanceId: relayInstanceId,
        handshakeRequired: true,
        pendingCount: relayQueue.pendingCount(),
      }, origin);
      return;
    }

    if (request.method === "POST" && request.url === "/browser/handshake") {
      try {
        const handshake = readHandshakeRequest(parseJsonBody(await readRequestBody(request)));
        if (!handshake || handshake.protocolVersion !== CONVYY_RELAY_PROTOCOL_VERSION) {
          writeJson(response, 400, { ok: false, error: "Invalid relay handshake request." }, origin);
          return;
        }

        const nowTs = now();
        pruneExpiredBrowserSessions(nowTs);
        if (browserSessions.size >= maxSessions) {
          evictOldestBrowserSession();
        }

        const sessionToken = randomUUID();
        browserSessions.set(handshake.clientId, {
          boardId: handshake.boardId,
          sessionToken,
          expiresAt: nowTs + sessionTtlMs,
        });

        const payload: RelayHandshakeResponse = {
          ok: true,
          protocolVersion: CONVYY_RELAY_PROTOCOL_VERSION,
          instanceId: relayInstanceId,
          clientId: handshake.clientId,
          boardId: handshake.boardId,
          nonce: handshake.nonce,
          sessionToken,
        };
        writeJson(response, 200, payload, origin);
      } catch (error) {
        if (isPayloadTooLargeError(error)) {
          writeJson(response, 413, { ok: false, error: error.message }, origin);
          return;
        }
        writeJson(response, 500, {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown relay handshake error.",
        }, origin);
      }
      return;
    }

    const authenticatedBrowserSession = (() => {
      const clientId = request.headers[CONVYY_RELAY_CLIENT_ID_HEADER];
      const sessionToken = request.headers[CONVYY_RELAY_TOKEN_HEADER];
      if (typeof clientId !== "string" || typeof sessionToken !== "string") {
        return null;
      }
      const session = browserSessions.get(clientId);
      if (!session) {
        return null;
      }
      if (session.expiresAt <= now()) {
        browserSessions.delete(clientId);
        return null;
      }
      if (session.sessionToken !== sessionToken) {
        return null;
      }
      return { clientId, boardId: session.boardId };
    })();

    if (request.method === "GET" && request.url === "/browser/pull") {
      if (!authenticatedBrowserSession) {
        writeJson(response, 403, { ok: false, error: "Relay handshake required." }, origin);
        return;
      }
      const payload: RelayPullResponse = {
        request: relayQueue.pull(),
      };
      writeJson(response, 200, payload, origin);
      return;
    }

    if (request.method === "POST" && request.url === "/browser/push") {
      if (!authenticatedBrowserSession) {
        writeJson(response, 403, { ok: false, error: "Relay handshake required." }, origin);
        return;
      }
      try {
        const body = parseJsonBody(await readRequestBody(request));
        if (!isRecord(body) || typeof body.relayRequestId !== "string") {
          writeJson(response, 400, { ok: false, error: "Invalid relay push body." }, origin);
          return;
        }

        const accepted = relayQueue.resolve(
          body.relayRequestId,
          (body.response as JsonRpcResponse | null | undefined) ?? null,
        );
        writeJson(response, 200, { ok: accepted }, origin);
      } catch (error) {
        if (isPayloadTooLargeError(error)) {
          writeJson(response, 413, { ok: false, error: error.message }, origin);
          return;
        }
        writeJson(response, 500, {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown bridge push error.",
        }, origin);
      }
      return;
    }

    // Tool calls submitted by other agents (other Claude/Codex sessions) whose
    // own MCP process could not own the port and attached as a relay client.
    // The request is queued just like a local stdio tool call and resolved by
    // the same browser pull/push round trip.
    if (request.method === "POST" && request.url === "/agent/request") {
      if (
        !agentToken
        || request.headers[CONVYY_RELAY_AGENT_TOKEN_HEADER] !== agentToken
      ) {
        writeJson(response, 403, { ok: false, error: "Agent token required." }, origin);
        return;
      }
      try {
        const body = parseJsonBody(await readRequestBody(request));
        if (!isRecord(body) || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
          writeJson(response, 400, { ok: false, error: "Invalid agent request body." }, origin);
          return;
        }
        const result = await relayQueue.enqueue(body as unknown as JsonRpcRequest, requestTimeoutMs);
        writeJson(response, 200, { ok: true, response: result }, origin);
      } catch (error) {
        if (isPayloadTooLargeError(error)) {
          writeJson(response, 413, { ok: false, error: error.message }, origin);
          return;
        }
        writeJson(response, 200, {
          ok: false,
          error: error instanceof Error ? error.message : "Convyy relay failed to route the agent request.",
        }, origin);
      }
      return;
    }

    writeJson(response, 404, { error: "Not found" }, origin);
  });

  // Bridge this process's own MCP client (Claude/Codex) over stdio. `dispatch`
  // routes tool calls either to the local queue (when we own the relay) or to
  // the already-running relay over HTTP (when we attached as a client).
  function attachStdioBridge(dispatch: (request: JsonRpcRequest) => Promise<JsonRpcResponse | null>) {
    createStdioMessageReader(async (payload) => {
      if (!isRecord(payload) || payload.jsonrpc !== "2.0" || typeof payload.method !== "string") {
        writeFramedJsonRpcMessage(createJsonRpcError(null, -32600, "Invalid Request"));
        return;
      }

      const request = payload as unknown as JsonRpcRequest;

      if (request.method === "initialize") {
        const clientInfo = isRecord(request.params) && isRecord(request.params.clientInfo)
          ? request.params.clientInfo
          : null;
        agentName = clientInfo && typeof clientInfo.name === "string" ? clientInfo.name : null;
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
        // Inject the captured agent name so the board can label the cursor.
        if (agentName && isRecord(request.params)) {
          (request.params as Record<string, unknown>)._convyyAgent = agentName;
        }
        const result = await dispatch(request);
        if (result) {
          writeFramedJsonRpcMessage(ensureToolResultContent(request, result));
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
  }

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      // Another Convyy MCP instance already owns the relay and the open board.
      // Instead of exiting (which surfaced as "Connection closed" and made the
      // MCP work in only one project at a time), attach to the existing relay
      // as a client and forward this session's tool calls over HTTP.
      proc?.stderr?.write(
        `Convyy MCP relay ${host}:${port} is already running; attaching to it as a client.\n`,
      );
      attachStdioBridge((request) => forwardAgentRequest(host, port, request, requestTimeoutMs));
      return;
    }
    proc?.stderr?.write(`Convyy MCP relay failed to start: ${error.message}\n`);
    proc?.exit(1);
  });

  server.on("listening", () => {
    isOwner = true;
    agentToken = randomUUID();
    fs.writeFileSync(tokenPath, agentToken, { mode: 0o600 });
    // We own the relay: serve the board (pull/push), other agents (/agent/request),
    // and bridge our own MCP client straight into the local queue.
    attachStdioBridge((request) => relayQueue.enqueue(request, requestTimeoutMs));
  });

  function cleanupAgentTokenFile() {
    if (!isOwner) {
      return;
    }
    fs.rmSync(tokenPath, { force: true });
    agentToken = null;
  }

  server.on("close", cleanupAgentTokenFile);

  // When the MCP client (Claude/Codex) closes the session it closes stdin.
  // Owners must release the relay port promptly so the next session can claim
  // it; clients simply exit.
  function shutdown() {
    if (isOwner) {
      server.close();
      cleanupAgentTokenFile();
    }
    proc?.exit(0);
  }
  proc?.stdin?.on("end", shutdown);
  proc?.stdin?.on("close", shutdown);

  server.listen(port, host);

  return server;
}
