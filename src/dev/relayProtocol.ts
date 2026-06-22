import type { JsonRpcRequest, JsonRpcResponse } from "../server/mcpProtocol";

export interface PendingRelayRequest {
  relayRequestId: string;
  message: JsonRpcRequest;
}

export interface RelayPullResponse {
  request: PendingRelayRequest | null;
}

export interface RelayPushRequest {
  relayRequestId: string;
  response: JsonRpcResponse | null;
}
