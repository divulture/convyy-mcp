import os from "node:os";
import path from "node:path";

import type { JsonRpcRequest, JsonRpcResponse } from "../server/mcpProtocol";

export const CONVYY_RELAY_PROTOCOL_VERSION = "convyy-dev-relay.v1";
export const CONVYY_RELAY_CLIENT_ID_HEADER = "x-convyy-relay-client-id";
export const CONVYY_RELAY_TOKEN_HEADER = "x-convyy-relay-token";
export const CONVYY_RELAY_AGENT_TOKEN_HEADER = "x-convyy-relay-agent-token";
// Board origins that may call the local relay from a browser context.
export const CONVYY_RELAY_ALLOWED_ORIGIN_SUFFIXES = [
  "http://localhost",
  "http://127.0.0.1",
  "https://convyy.com",
  "https://www.convyy.com",
  "https://whiteboard-sepia.vercel.app",
] as const;
export const CONVYY_RELAY_ALLOWED_HOSTS = ["127.0.0.1", "localhost"] as const;

export function getRelayAgentTokenPath(port: number): string {
  return path.join(os.tmpdir(), `convyy-mcp-relay-${port}.token`);
}

export function isAllowedRelayOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return true;
  }
  return CONVYY_RELAY_ALLOWED_ORIGIN_SUFFIXES.some(
    (allowed) => origin === allowed || origin.startsWith(`${allowed}:`),
  );
}

export function isAllowedRelayHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) {
    return false;
  }
  try {
    const parsed = new URL(`http://${hostHeader}`);
    return CONVYY_RELAY_ALLOWED_HOSTS.some((allowedHost) => parsed.hostname === allowedHost);
  } catch {
    return false;
  }
}

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
