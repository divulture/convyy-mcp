import http from "node:http";
import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { runConvyyMcpDevRelay } from "../src/dev/devRelayServer";
import { CONVYY_RELAY_PROTOCOL_VERSION } from "../src/dev/relayProtocol";

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

function requestJson(params: {
  port: number;
  path: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
  payload?: unknown;
}): Promise<{ statusCode: number; body: unknown; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const body = params.payload ? JSON.stringify(params.payload) : null;
    const req = http.request(
      {
        host: HOST,
        port: params.port,
        path: params.path,
        method: params.method,
        headers: {
          ...(body ? { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(body)) } : {}),
          ...params.headers,
        },
      },
      (res) => {
        let rawBody = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          rawBody += chunk;
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: rawBody ? JSON.parse(rawBody) : null,
            headers: res.headers,
          });
        });
      },
    );
    req.on("error", reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

describe("convyy relay handshake", () => {
  let cleanup: Array<() => void> = [];

  afterEach(async () => {
    [...cleanup].reverse().forEach((fn) => fn());
    cleanup = [];
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  it("rejects browser pull before handshake", async () => {
    const port = await findFreePort();
    const server = runConvyyMcpDevRelay({ host: HOST, port, requestTimeoutMs: 5_000 });
    cleanup.push(() => server.close());
    await new Promise((resolve) => server.once("listening", resolve));

    const response = await requestJson({
      port,
      path: "/browser/pull",
      method: "GET",
      headers: {
        Origin: ALLOWED_ORIGIN,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({ ok: false, error: "Relay handshake required." });
    expect(response.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
  });

  it("accepts pull after a valid handshake token is issued", async () => {
    const port = await findFreePort();
    const server = runConvyyMcpDevRelay({ host: HOST, port, requestTimeoutMs: 5_000 });
    cleanup.push(() => server.close());
    await new Promise((resolve) => server.once("listening", resolve));

    const handshake = await requestJson({
      port,
      path: "/browser/handshake",
      method: "POST",
      payload: {
        protocolVersion: CONVYY_RELAY_PROTOCOL_VERSION,
        clientId: "browser-1",
        boardId: "board-1",
        nonce: "nonce-1",
      },
      headers: {
        Origin: ALLOWED_ORIGIN,
      },
    });

    expect(handshake.statusCode).toBe(200);
    expect(handshake.body).toMatchObject({
      ok: true,
      protocolVersion: CONVYY_RELAY_PROTOCOL_VERSION,
      clientId: "browser-1",
      boardId: "board-1",
      nonce: "nonce-1",
      sessionToken: expect.any(String),
    });
    expect(handshake.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);

    const sessionToken = (handshake.body as { sessionToken: string }).sessionToken;
    const pull = await requestJson({
      port,
      path: "/browser/pull",
      method: "GET",
      headers: {
        Origin: ALLOWED_ORIGIN,
        "X-Convyy-Relay-Client-Id": "browser-1",
        "X-Convyy-Relay-Token": sessionToken,
      },
    });

    expect(pull.statusCode).toBe(200);
    expect(pull.body).toEqual({ request: null });
    expect(pull.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
  });

  it("rejects an expired browser session token", async () => {
    let now = 10_000;
    const port = await findFreePort();
    const server = runConvyyMcpDevRelay({
      host: HOST,
      port,
      requestTimeoutMs: 5_000,
      sessionTtlMs: 1_000,
      now: () => now,
    });
    cleanup.push(() => server.close());
    await new Promise((resolve) => server.once("listening", resolve));

    const handshake = await requestJson({
      port,
      path: "/browser/handshake",
      method: "POST",
      payload: {
        protocolVersion: CONVYY_RELAY_PROTOCOL_VERSION,
        clientId: "browser-expired",
        boardId: "board-1",
        nonce: "nonce-expired",
      },
      headers: {
        Origin: ALLOWED_ORIGIN,
      },
    });

    const sessionToken = (handshake.body as { sessionToken: string }).sessionToken;
    now += 1_001;

    const pull = await requestJson({
      port,
      path: "/browser/pull",
      method: "GET",
      headers: {
        Origin: ALLOWED_ORIGIN,
        "X-Convyy-Relay-Client-Id": "browser-expired",
        "X-Convyy-Relay-Token": sessionToken,
      },
    });

    expect(pull.statusCode).toBe(403);
    expect(pull.body).toEqual({ ok: false, error: "Relay handshake required." });
  });

  it("evicts the oldest active session when the session map reaches its limit", async () => {
    let now = 50_000;
    const port = await findFreePort();
    const server = runConvyyMcpDevRelay({
      host: HOST,
      port,
      requestTimeoutMs: 5_000,
      sessionTtlMs: 60_000,
      maxSessions: 2,
      now: () => now,
    });
    cleanup.push(() => server.close());
    await new Promise((resolve) => server.once("listening", resolve));

    async function handshake(clientId: string) {
      const response = await requestJson({
        port,
        path: "/browser/handshake",
        method: "POST",
        payload: {
          protocolVersion: CONVYY_RELAY_PROTOCOL_VERSION,
          clientId,
          boardId: `${clientId}-board`,
          nonce: `${clientId}-nonce`,
        },
        headers: {
          Origin: ALLOWED_ORIGIN,
        },
      });
      return (response.body as { sessionToken: string }).sessionToken;
    }

    const token1 = await handshake("browser-1");
    now += 10;
    const token2 = await handshake("browser-2");
    now += 10;
    await handshake("browser-3");

    const firstPull = await requestJson({
      port,
      path: "/browser/pull",
      method: "GET",
      headers: {
        Origin: ALLOWED_ORIGIN,
        "X-Convyy-Relay-Client-Id": "browser-1",
        "X-Convyy-Relay-Token": token1,
      },
    });
    expect(firstPull.statusCode).toBe(403);
    expect(firstPull.body).toEqual({ ok: false, error: "Relay handshake required." });

    const secondPull = await requestJson({
      port,
      path: "/browser/pull",
      method: "GET",
      headers: {
        Origin: ALLOWED_ORIGIN,
        "X-Convyy-Relay-Client-Id": "browser-2",
        "X-Convyy-Relay-Token": token2,
      },
    });
    expect(secondPull.statusCode).toBe(200);
    expect(secondPull.body).toEqual({ request: null });
  });

  it("rejects a browser origin outside the allowlist", async () => {
    const port = await findFreePort();
    const server = runConvyyMcpDevRelay({ host: HOST, port, requestTimeoutMs: 5_000 });
    cleanup.push(() => server.close());
    await new Promise((resolve) => server.once("listening", resolve));

    const response = await requestJson({
      port,
      path: "/health",
      method: "GET",
      headers: {
        Origin: "https://evil.example",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({ ok: false, error: "Origin not allowed." });
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rejects a non-loopback host header", async () => {
    const port = await findFreePort();
    const server = runConvyyMcpDevRelay({ host: HOST, port, requestTimeoutMs: 5_000 });
    cleanup.push(() => server.close());
    await new Promise((resolve) => server.once("listening", resolve));

    const response = await requestJson({
      port,
      path: "/health",
      method: "GET",
      headers: {
        Host: `evil.example:${port}`,
        Origin: ALLOWED_ORIGIN,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({
      ok: false,
      error: "Host not allowed. Expected one of: 127.0.0.1, localhost.",
    });
    expect(response.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
  });
});
