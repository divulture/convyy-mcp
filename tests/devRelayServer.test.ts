import http from "node:http";
import fs from "node:fs";
import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import {
  forwardAgentRequest,
  runConvyyMcpDevRelay,
} from "../src/dev/devRelayServer";
import {
  CONVYY_RELAY_AGENT_TOKEN_HEADER,
  CONVYY_RELAY_PROTOCOL_VERSION,
  getRelayAgentTokenPath,
} from "../src/dev/relayProtocol";
import type { JsonRpcRequest, JsonRpcResponse } from "../src/server/mcpProtocol";

const HOST = "127.0.0.1";
const ALLOWED_ORIGIN = "https://convyy.com";

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, HOST, () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

function getJson(
  port: number,
  path: string,
  headers?: Record<string, string>,
): Promise<{ body: unknown; headers: http.IncomingHttpHeaders; statusCode: number }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: HOST, port, path, method: "GET", headers }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({
        body: body ? JSON.parse(body) : null,
        headers: res.headers,
        statusCode: res.statusCode ?? 0,
      }));
    });
    req.on("error", reject);
    req.end();
  });
}

function postJson(
  port: number,
  path: string,
  payload: unknown,
  headers?: Record<string, string>,
): Promise<{ body: unknown; headers: http.IncomingHttpHeaders; statusCode: number }> {
  return postRaw(port, path, JSON.stringify(payload), headers);
}

function postRaw(
  port: number,
  path: string,
  body: string,
  headers?: Record<string, string>,
): Promise<{ body: unknown; headers: http.IncomingHttpHeaders; statusCode: number }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: HOST,
        port,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...headers,
        },
      },
      (res) => {
        let responseBody = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (responseBody += chunk));
        res.on("end", () => resolve({
          body: responseBody ? JSON.parse(responseBody) : null,
          headers: res.headers,
          statusCode: res.statusCode ?? 0,
        }));
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

async function createBrowserRelayHeaders(port: number): Promise<Record<string, string>> {
  const body = JSON.stringify({
    protocolVersion: CONVYY_RELAY_PROTOCOL_VERSION,
    clientId: "test-browser",
    boardId: "board-1",
    nonce: "test-nonce",
  });

  const payload = await new Promise<{ sessionToken: string }>((resolve, reject) => {
    const req = http.request(
      {
        host: HOST,
        port,
        path: "/browser/handshake",
        method: "POST",
        headers: {
          Origin: ALLOWED_ORIGIN,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let responseBody = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (responseBody += chunk));
        res.on("end", () => resolve(JSON.parse(responseBody) as { sessionToken: string }));
      },
    );
    req.on("error", reject);
    req.end(body);
  });

  return {
    Origin: ALLOWED_ORIGIN,
    "X-Convyy-Relay-Client-Id": "test-browser",
    "X-Convyy-Relay-Token": payload.sessionToken,
  };
}

// Simulates the board: long-polls /browser/pull and pushes a crafted response
// for whatever request id it receives, until stopped.
function startFakeBoard(port: number, makeResponse: (request: JsonRpcRequest) => JsonRpcResponse) {
  let running = true;
  async function loop() {
    const relayHeaders = await createBrowserRelayHeaders(port);
    while (running) {
      try {
        const pulled = (await getJson(port, "/browser/pull", relayHeaders)) as {
          body: { request: { relayRequestId: string; message: JsonRpcRequest } | null };
          headers: http.IncomingHttpHeaders;
          statusCode: number;
        };
        if (pulled.body?.request) {
          await postJson(port, "/browser/push", {
            relayRequestId: pulled.body.request.relayRequestId,
            response: makeResponse(pulled.body.request.message),
          }, relayHeaders);
        } else {
          await new Promise((r) => setTimeout(r, 10));
        }
      } catch {
        // The relay was torn down mid-poll (test cleanup); stop quietly.
        running = false;
      }
    }
  }
  void loop();
  return () => {
    running = false;
  };
}

describe("convyy dev relay sharing", () => {
  let cleanup: Array<() => void> = [];

  afterEach(async () => {
    // Tear down in reverse order (stop boards before closing the relay) so no
    // long-poll is left in flight against a closing server.
    [...cleanup].reverse().forEach((fn) => fn());
    cleanup = [];
    await new Promise((r) => setTimeout(r, 20));
  });

  it("routes an agent request through the board round trip", async () => {
    const port = await findFreePort();
    const server = runConvyyMcpDevRelay({ host: HOST, port, requestTimeoutMs: 5_000 });
    cleanup.push(() => server.close());
    await new Promise((resolve) => server.once("listening", resolve));

    const stopBoard = startFakeBoard(port, (message) => ({
      jsonrpc: "2.0",
      id: message.id ?? null,
      result: { echoed: message.method },
    }));
    cleanup.push(stopBoard);

    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "convyy_demo" },
    };

    const tokenPath = getRelayAgentTokenPath(port);
    expect(fs.readFileSync(tokenPath, "utf8").trim()).not.toHaveLength(0);
    expect(fs.statSync(tokenPath).mode & 0o777).toBe(0o600);

    const response = await forwardAgentRequest(HOST, port, request, 5_000);

    expect(response).toEqual<JsonRpcResponse>({
      jsonrpc: "2.0",
      id: 7,
      result: { echoed: "tools/call" },
    });
  });

  it("rejects /agent/request without a relay agent token and keeps the queue empty", async () => {
    const port = await findFreePort();
    const server = runConvyyMcpDevRelay({ host: HOST, port, requestTimeoutMs: 5_000 });
    cleanup.push(() => server.close());
    await new Promise((resolve) => server.once("listening", resolve));

    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: 11,
      method: "tools/call",
      params: { name: "convyy_demo" },
    };

    const denied = await postJson(port, "/agent/request", request);
    expect(denied.statusCode).toBe(403);
    expect(denied.body).toEqual({ ok: false, error: "Agent token required." });

    const relayHeaders = await createBrowserRelayHeaders(port);
    const pulled = await getJson(port, "/browser/pull", relayHeaders);
    expect(pulled.statusCode).toBe(200);
    expect(pulled.body).toEqual({ request: null });
  });

  it("accepts /agent/request when the correct relay agent token is provided", async () => {
    const port = await findFreePort();
    const server = runConvyyMcpDevRelay({ host: HOST, port, requestTimeoutMs: 5_000 });
    cleanup.push(() => server.close());
    await new Promise((resolve) => server.once("listening", resolve));

    const stopBoard = startFakeBoard(port, (message) => ({
      jsonrpc: "2.0",
      id: message.id ?? null,
      result: { echoed: message.method },
    }));
    cleanup.push(stopBoard);

    const token = fs.readFileSync(getRelayAgentTokenPath(port), "utf8").trim();
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: 12,
      method: "tools/call",
      params: { name: "convyy_demo" },
    };

    const accepted = await postJson(port, "/agent/request", request, {
      [CONVYY_RELAY_AGENT_TOKEN_HEADER]: token,
    });

    expect(accepted.statusCode).toBe(200);
    expect(accepted.body).toEqual({
      ok: true,
      response: {
        jsonrpc: "2.0",
        id: 12,
        result: { echoed: "tools/call" },
      },
    });
  });

  it("removes the relay agent token file when the owner server closes", async () => {
    const port = await findFreePort();
    const server = runConvyyMcpDevRelay({ host: HOST, port, requestTimeoutMs: 5_000 });
    await new Promise((resolve) => server.once("listening", resolve));

    const tokenPath = getRelayAgentTokenPath(port);
    expect(fs.existsSync(tokenPath)).toBe(true);

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    expect(fs.existsSync(tokenPath)).toBe(false);
  });

  it("does not crash when a second relay finds the port already owned", async () => {
    const port = await findFreePort();
    const owner = runConvyyMcpDevRelay({ host: HOST, port, requestTimeoutMs: 5_000 });
    cleanup.push(() => owner.close());
    await new Promise((resolve) => owner.once("listening", resolve));

    const second = runConvyyMcpDevRelay({ host: HOST, port, requestTimeoutMs: 5_000 });
    cleanup.push(() => second.close());

    // The second instance must surface EADDRINUSE (and switch to client mode)
    // rather than throwing an unhandled error or claiming the port.
    const code = await new Promise<string | undefined>((resolve) => {
      second.once("error", (error: NodeJS.ErrnoException) => resolve(error.code));
      // If no error fires quickly, the port was wrongly claimed twice.
      setTimeout(() => resolve("NO_ERROR"), 1_000);
    });

    expect(code).toBe("EADDRINUSE");
  });

  it("returns a concrete allowed origin instead of wildcard CORS", async () => {
    const port = await findFreePort();
    const server = runConvyyMcpDevRelay({ host: HOST, port, requestTimeoutMs: 5_000 });
    cleanup.push(() => server.close());
    await new Promise((resolve) => server.once("listening", resolve));

    const response = await getJson(port, "/health", {
      Origin: ALLOWED_ORIGIN,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
    expect(response.headers["access-control-allow-origin"]).not.toBe("*");
  });

  it("rejects request bodies above the size limit with 413", async () => {
    const port = await findFreePort();
    const server = runConvyyMcpDevRelay({ host: HOST, port, requestTimeoutMs: 5_000 });
    cleanup.push(() => server.close());
    await new Promise((resolve) => server.once("listening", resolve));

    const oversizedHandshake = JSON.stringify({
      protocolVersion: CONVYY_RELAY_PROTOCOL_VERSION,
      clientId: "test-browser",
      boardId: "x".repeat(2 * 1024 * 1024),
      nonce: "test-nonce",
    });

    const response = await postRaw(port, "/browser/handshake", oversizedHandshake, {
      Origin: ALLOWED_ORIGIN,
      "Content-Type": "application/json",
    });

    expect(response.statusCode).toBe(413);
    expect(response.body).toEqual({ ok: false, error: "Payload too large." });
  });
});
