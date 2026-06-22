import { spawn } from "node:child_process";

// MCP stdio framing: one JSON-RPC message per line, terminated by "\n".
function encodeFrame(message) {
  return Buffer.from(`${JSON.stringify(message)}\n`, "utf8");
}

const child = spawn("node", ["dist/server.js", "--local"], {
  stdio: ["pipe", "pipe", "inherit"],
});

let buffer = "";
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
  buffer += chunk.toString("utf8");

  let newlineIndex = buffer.indexOf("\n");
  while (newlineIndex !== -1) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    newlineIndex = buffer.indexOf("\n");

    if (!line) {
      continue;
    }

    let message;
    try {
      message = JSON.parse(line);
    } catch {
      console.error("Smoke check received a non-JSON line.");
      finish(1);
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
    return;
  }
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
