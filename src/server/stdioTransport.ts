import type { JsonRpcResponse } from "./mcpProtocol";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const nodeProcess = globalThis as typeof globalThis & {
  process?: {
    stdout: { write: (chunk: Uint8Array | string) => void };
    stdin: { on: (event: string, callback: (chunk: Uint8Array) => void) => void };
  };
};

function encodeFrame(payload: string): Uint8Array {
  const body = encoder.encode(payload);
  const header = encoder.encode(`Content-Length: ${body.byteLength}\r\n\r\n`);
  const framed = new Uint8Array(header.byteLength + body.byteLength);
  framed.set(header, 0);
  framed.set(body, header.byteLength);
  return framed;
}

export function writeFramedJsonRpcMessage(response: JsonRpcResponse): void {
  nodeProcess.process?.stdout.write(encodeFrame(JSON.stringify(response)));
}

export function createStdioMessageReader(onMessage: (payload: unknown) => void): void {
  let buffer = new Uint8Array(0);

  nodeProcess.process?.stdin.on("data", (chunk: Uint8Array) => {
    const next = new Uint8Array(buffer.byteLength + chunk.byteLength);
    next.set(buffer, 0);
    next.set(chunk, buffer.byteLength);
    buffer = next;

    while (true) {
      const headerEnd = decoder.decode(buffer).indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return;
      }

      const headerText = decoder.decode(buffer.subarray(0, headerEnd));
      const lengthLine = headerText
        .split("\r\n")
        .map((line: string) => line.trim())
        .find((line: string) => line.toLowerCase().startsWith("content-length:"));

      if (!lengthLine) {
        buffer = buffer.subarray(headerEnd + 4);
        continue;
      }

      const contentLength = Number.parseInt(lengthLine.split(":")[1]?.trim() ?? "", 10);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;

      if (!Number.isFinite(contentLength) || buffer.byteLength < bodyEnd) {
        return;
      }

      const bodyText = decoder.decode(buffer.subarray(bodyStart, bodyEnd));
      buffer = buffer.subarray(bodyEnd);
      onMessage(JSON.parse(bodyText) as unknown);
    }
  });
}
