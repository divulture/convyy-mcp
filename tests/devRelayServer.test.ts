import http from "node:http";
import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import {
  forwardAgentRequest,
  runConvyyMcpDevRelay,
} from "../src/dev/devRelayServer";
import type { JsonRpcRequest, JsonRpcResponse } from "../src/server/mcpProtocol";

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

function getJson(port: number, path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: HOST, port, path, method: "GET" }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve(body ? JSON.parse(body) : null));
    });
    req.on("error", reject);
    req.end();
  });
}

function postJson(port: number, path: string, payload: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request(
      {
        host: HOST,
        port,
        path,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        res.resume();
        res.on("end", resolve);
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

// Simulates the board: long-polls /browser/pull and pushes a crafted response
// for whatever request id it receives, until stopped.
function startFakeBoard(port: number, makeResponse: (request: JsonRpcRequest) => JsonRpcResponse) {
  let running = true;
  async function loop() {
    while (running) {
      try {
        const pulled = (await getJson(port, "/browser/pull")) as {
          request: { relayRequestId: string; message: JsonRpcRequest } | null;
        };
        if (pulled?.request) {
          await postJson(port, "/browser/push", {
            relayRequestId: pulled.request.relayRequestId,
            response: makeResponse(pulled.request.message),
          });
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
    const response = await forwardAgentRequest(HOST, port, request, 5_000);

    expect(response).toEqual<JsonRpcResponse>({
      jsonrpc: "2.0",
      id: 7,
      result: { echoed: "tools/call" },
    });
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
});
