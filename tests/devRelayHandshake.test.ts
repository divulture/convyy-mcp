import http from "node:http";
import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { runConvyyMcpDevRelay } from "../src/dev/devRelayServer";
import { CONVYY_RELAY_PROTOCOL_VERSION } from "../src/dev/relayProtocol";

const HOST = "127.0.0.1";

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
}): Promise<{ statusCode: number; body: unknown }> {
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
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({ ok: false, error: "Relay handshake required." });
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

    const sessionToken = (handshake.body as { sessionToken: string }).sessionToken;
    const pull = await requestJson({
      port,
      path: "/browser/pull",
      method: "GET",
      headers: {
        "X-Convyy-Relay-Client-Id": "browser-1",
        "X-Convyy-Relay-Token": sessionToken,
      },
    });

    expect(pull.statusCode).toBe(200);
    expect(pull.body).toEqual({ request: null });
  });
});
