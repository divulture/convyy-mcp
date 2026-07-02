import { describe, expect, it } from "vitest";

import { createRelayQueue, MAX_RELAY_PENDING_REQUESTS } from "../src/dev/relayQueue";
import type { JsonRpcRequest } from "../src/server/mcpProtocol";

function buildRequest(id: number): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name: `tool-${id}` },
  };
}

describe("relayQueue", () => {
  it("rejects enqueue once the queue reaches the pending limit", () => {
    const queue = createRelayQueue();

    for (let index = 0; index < MAX_RELAY_PENDING_REQUESTS; index += 1) {
      queue.enqueue(buildRequest(index), 60_000).catch(() => undefined);
    }

    expect(queue.pendingCount()).toBe(MAX_RELAY_PENDING_REQUESTS);
    expect(() => queue.enqueue(buildRequest(MAX_RELAY_PENDING_REQUESTS), 60_000)).toThrow(
      "Relay queue is full.",
    );
    expect(queue.pendingCount()).toBe(MAX_RELAY_PENDING_REQUESTS);
  });
});
