import type { JsonRpcResponse } from "./mcpProtocol";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const nodeProcess = globalThis as typeof globalThis & {
  process?: {
    stdout: { write: (chunk: Uint8Array | string) => void };
    stdin: { on: (event: string, callback: (chunk: Uint8Array) => void) => void };
  };
};

// The MCP stdio transport frames each JSON-RPC message as a single line of
// JSON terminated by a newline. Messages must not contain embedded newlines,
// which JSON.stringify already guarantees. This is intentionally NOT the
// LSP-style `Content-Length` framing — MCP clients (Claude, Codex, Cursor,
// Cline) speak newline-delimited JSON and will not complete the handshake
// against Content-Length frames.
export function writeFramedJsonRpcMessage(response: JsonRpcResponse): void {
  nodeProcess.process?.stdout.write(encoder.encode(`${JSON.stringify(response)}\n`));
}

export function createStdioMessageReader(onMessage: (payload: unknown) => void): void {
  let buffer = "";

  nodeProcess.process?.stdin.on("data", (chunk: Uint8Array) => {
    buffer += decoder.decode(chunk, { stream: true });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (line.length > 0) {
        try {
          onMessage(JSON.parse(line) as unknown);
        } catch {
          // Ignore malformed lines; a partial or non-JSON line should not
          // tear down the transport.
        }
      }

      newlineIndex = buffer.indexOf("\n");
    }
  });
}
