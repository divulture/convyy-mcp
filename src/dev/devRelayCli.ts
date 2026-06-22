import { runConvyyMcpDevRelay } from "./devRelayServer";

const nodeProcess = globalThis as typeof globalThis & {
  process?: {
    stdout: { write: (chunk: unknown) => void };
    exit: (code?: number) => never;
    argv: string[];
  };
};

function getArgValue(args: ReadonlyArray<string>, flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }
  return args[index + 1] ?? null;
}

export function runDevRelayCli(args: ReadonlyArray<string>): number {
  if (args.includes("--help")) {
    nodeProcess.process?.stdout.write(
      "Usage: convyy-mcp-dev [--host 127.0.0.1] [--port 4318] [--timeout 15000]\n",
    );
    return 0;
  }

  const host = getArgValue(args, "--host") ?? "127.0.0.1";
  const port = Number.parseInt(getArgValue(args, "--port") ?? "4318", 10);
  const timeoutMs = Number.parseInt(getArgValue(args, "--timeout") ?? "15000", 10);

  runConvyyMcpDevRelay({
    host,
    port: Number.isFinite(port) ? port : 4318,
    requestTimeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 15000,
  });

  nodeProcess.process?.stdout.write(
    `Convyy MCP dev relay is listening on http://${host}:${Number.isFinite(port) ? port : 4318}\n`,
  );
  return 0;
}

if (import.meta.url === `file://${nodeProcess.process?.argv[1] ?? ""}`) {
  const exitCode = runDevRelayCli(nodeProcess.process?.argv.slice(2) ?? []);
  nodeProcess.process?.exit(exitCode);
}
