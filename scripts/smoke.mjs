import { spawn } from "node:child_process";

function encodeFrame(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  return Buffer.concat([
    Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8"),
    body,
  ]);
}

function decodeFrames(buffer) {
  const text = buffer.toString("utf8");
  const headerEnd = text.indexOf("\r\n\r\n");
  if (headerEnd < 0) {
    return null;
  }

  const header = text.slice(0, headerEnd);
  const match = header.match(/Content-Length:\s*(\d+)/i);
  if (!match) {
    throw new Error("Missing Content-Length header in smoke response.");
  }

  const bodyLength = Number(match[1]);
  const bodyStart = headerEnd + 4;
  const bodyEnd = bodyStart + bodyLength;
  if (buffer.length < bodyEnd) {
    return null;
  }

  return JSON.parse(buffer.subarray(bodyStart, bodyEnd).toString("utf8"));
}

const child = spawn("node", ["dist/server.js"], {
  stdio: ["pipe", "pipe", "inherit"],
});

const chunks = [];
let settled = false;

function finish(code) {
  if (settled) {
    return;
  }
  settled = true;
  child.kill();
  process.exit(code);
}

const timeout = setTimeout(() => {
  console.error("Smoke check timed out waiting for MCP initialize response.");
  finish(1);
}, 5000);

child.stdout.on("data", (chunk) => {
  chunks.push(chunk);
  const message = decodeFrames(Buffer.concat(chunks));
  if (!message) {
    return;
  }

  clearTimeout(timeout);

  if (message.jsonrpc !== "2.0" || message.id !== 1 || !message.result?.serverInfo?.name) {
    console.error("Smoke check received an invalid MCP response.");
    finish(1);
    return;
  }

  console.log(`OK ${message.result.serverInfo.name}@${message.result.serverInfo.version}`);
  finish(0);
});

child.on("exit", (code) => {
  if (settled) {
    return;
  }
  clearTimeout(timeout);
  console.error(`Smoke check server exited early with code ${code ?? "null"}.`);
  finish(1);
});

child.stdin.write(encodeFrame({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {},
}));
