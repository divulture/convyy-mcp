import type { JsonRpcRequest, JsonRpcResponse } from "../server/mcpProtocol";

export const CONVYY_RELAY_PROTOCOL_VERSION = "convyy-dev-relay.v1";
export const CONVYY_RELAY_CLIENT_ID_HEADER = "x-convyy-relay-client-id";
export const CONVYY_RELAY_TOKEN_HEADER = "x-convyy-relay-token";

export interface PendingRelayRequest {
  relayRequestId: string;
  message: JsonRpcRequest;
}

export interface RelayHandshakeRequest {
  protocolVersion: string;
  clientId: string;
  boardId: string;
  nonce: string;
}

export interface RelayHandshakeResponse {
  ok: true;
  protocolVersion: string;
  instanceId: string;
  clientId: string;
  boardId: string;
  nonce: string;
  sessionToken: string;
}

export interface RelayPullResponse {
  request: PendingRelayRequest | null;
}

export interface RelayPushRequest {
  relayRequestId: string;
  response: JsonRpcResponse | null;
}
