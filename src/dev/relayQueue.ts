import type { JsonRpcRequest, JsonRpcResponse } from "../server/mcpProtocol";
import type { PendingRelayRequest } from "./relayProtocol";

interface DeferredResponse {
  resolve: (response: JsonRpcResponse | null) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export interface RelayQueue {
  enqueue(message: JsonRpcRequest, timeoutMs?: number): Promise<JsonRpcResponse | null>;
  pull(): PendingRelayRequest | null;
  resolve(relayRequestId: string, response: JsonRpcResponse | null): boolean;
  pendingCount(): number;
}

let relayRequestCounter = 0;

function createRelayRequestId(): string {
  relayRequestCounter += 1;
  return `relay-request-${relayRequestCounter}`;
}

export function createRelayQueue(): RelayQueue {
  const pendingRequests: PendingRelayRequest[] = [];
  const deferredById = new Map<string, DeferredResponse>();

  return {
    enqueue(message, timeoutMs = 15_000) {
      const relayRequestId = createRelayRequestId();
      const pendingRequest: PendingRelayRequest = {
        relayRequestId,
        message,
      };
      pendingRequests.push(pendingRequest);

      return new Promise<JsonRpcResponse | null>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          deferredById.delete(relayRequestId);
          reject(new Error(`Timed out waiting for Convyy dev bridge response for ${relayRequestId}.`));
        }, timeoutMs);

        deferredById.set(relayRequestId, { resolve, reject, timeoutId });
      });
    },

    pull() {
      return pendingRequests.shift() ?? null;
    },

    resolve(relayRequestId, response) {
      const deferred = deferredById.get(relayRequestId);
      if (!deferred) {
        return false;
      }

      clearTimeout(deferred.timeoutId);
      deferredById.delete(relayRequestId);
      deferred.resolve(response);
      return true;
    },

    pendingCount() {
      return pendingRequests.length;
    },
  };
}
