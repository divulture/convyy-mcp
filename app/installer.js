#!/usr/bin/env node

// src/installer/cli.ts
import fs10 from "node:fs";
import path7 from "node:path";
import { fileURLToPath } from "node:url";

// src/installer/engine.ts
import { randomBytes as randomBytes4 } from "node:crypto";
import fs9 from "node:fs";
import path6 from "node:path";

// src/dev/relayBootstrap.ts
import fs from "node:fs";

// src/dev/relayProtocol.ts
import os from "node:os";
import path from "node:path";
var CONVYY_RELAY_PROTOCOL_VERSION = "convyy-dev-relay.v1";
var CONVYY_MCP_STATE_DIR_ENV = "CONVYY_MCP_STATE_DIR";
function resolveMcpStateDir(context = {}) {
  const env = context.env ?? process.env;
  const platform = context.platform ?? process.platform;
  const homeDir = context.homeDir ?? os.homedir();
  const override = env[CONVYY_MCP_STATE_DIR_ENV];
  if (override && path.isAbsolute(override)) {
    return override;
  }
  if (platform === "darwin") {
    return path.join(homeDir, "Library", "Application Support", "Convyy", "mcp");
  }
  if (platform === "win32") {
    const localAppData = env.LOCALAPPDATA && path.win32.isAbsolute(env.LOCALAPPDATA) ? env.LOCALAPPDATA : path.win32.join(homeDir, "AppData", "Local");
    return path.win32.join(localAppData, "Convyy", "mcp");
  }
  const xdgState = env.XDG_STATE_HOME;
  return xdgState && path.isAbsolute(xdgState) ? path.join(xdgState, "convyy", "mcp") : path.join(homeDir, ".local", "state", "convyy", "mcp");
}
function getRelayAgentTokenPath(port) {
  return path.join(resolveMcpStateDir(), `relay-${port}.token`);
}
var CONVYY_RELAY_MIN_COMPATIBLE_REVISION = 2;
var CONVYY_RELAY_DEFAULT_IDLE_EXIT_MS = 10 * 60 * 1e3;
var CONVYY_RELAY_HEARTBEAT_INTERVAL_MS = 60 * 1e3;

// src/dev/relayBootstrap.ts
var HEALTH_TIMEOUT_MS = 1500;
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
async function inspectRelay(options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const fileExists = options.fileExists ?? fs.existsSync;
  let response;
  try {
    response = await fetchImpl(`http://${options.host}:${options.port}/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS)
    });
  } catch (error) {
    void error;
    return { state: "down" };
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    return { state: "foreign", reason: `Something other than a Convyy relay answers on port ${options.port}.` };
  }
  if (!response.ok || !isRecord(payload) || payload.ok !== true || typeof payload.protocolVersion !== "string") {
    return { state: "foreign", reason: `Something other than a Convyy relay answers on port ${options.port}.` };
  }
  if (payload.protocolVersion !== CONVYY_RELAY_PROTOCOL_VERSION) {
    return {
      state: "incompatible",
      reason: `The relay on port ${options.port} speaks ${payload.protocolVersion}, this connector speaks ${CONVYY_RELAY_PROTOCOL_VERSION}.`
    };
  }
  const revision = typeof payload.revision === "number" ? payload.revision : 0;
  if (revision < (options.minCompatibleRevision ?? CONVYY_RELAY_MIN_COMPATIBLE_REVISION)) {
    return {
      state: "incompatible",
      reason: `The relay on port ${options.port} is too old (revision ${revision}); it belongs to an outdated Convyy connector, which is no longer supported.`
    };
  }
  return {
    state: fileExists(getRelayAgentTokenPath(options.port)) ? "ready" : "token-missing",
    instanceId: typeof payload.instanceId === "string" ? payload.instanceId : null,
    version: typeof payload.version === "string" ? payload.version : null,
    revision,
    capabilities: Array.isArray(payload.capabilities) ? payload.capabilities.filter((entry) => typeof entry === "string") : [],
    pid: typeof payload.pid === "number" ? payload.pid : null,
    tokenWatchMs: typeof payload.tokenWatchMs === "number" ? payload.tokenWatchMs : 0,
    draining: payload.draining === true
  };
}

// src/installer/bundle.ts
import { createHash } from "node:crypto";
import fs2 from "node:fs";
import path3 from "node:path";

// src/installer/platform.ts
import os2 from "node:os";
import path2 from "node:path";
function pathApi(platform) {
  return platform === "win32" ? path2.win32 : path2.posix;
}
function createInstallContext(options = {}) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? (platform === "win32" ? env.USERPROFILE : env.HOME) ?? os2.homedir();
  const stateDir = resolveMcpStateDir({ env, platform, homeDir });
  return {
    platform,
    arch: options.arch ?? process.arch,
    env,
    homeDir,
    stateDir,
    installRoot: pathApi(platform).join(stateDir, "install")
  };
}
function detectPlatformId(platform, arch) {
  if (platform === "darwin" && arch === "arm64") {
    return "darwin-arm64";
  }
  if (platform === "darwin" && arch === "x64") {
    return "darwin-x64";
  }
  if (platform === "win32" && arch === "x64") {
    return "win-x64";
  }
  return null;
}
function versionsDir(ctx) {
  return pathApi(ctx.platform).join(ctx.installRoot, "versions");
}
function versionDir(ctx, version) {
  return pathApi(ctx.platform).join(versionsDir(ctx), version);
}
function backupsDir(ctx) {
  return pathApi(ctx.platform).join(ctx.installRoot, "backups");
}
function stagingDir(ctx) {
  return pathApi(ctx.platform).join(ctx.installRoot, ".staging");
}
function trashDir(ctx) {
  return pathApi(ctx.platform).join(ctx.installRoot, ".trash");
}
function installStatePath(ctx) {
  return pathApi(ctx.platform).join(ctx.installRoot, "state.json");
}
function installLockPath(ctx) {
  return pathApi(ctx.platform).join(ctx.installRoot, ".lock");
}
function codexConfigPath(ctx) {
  const api = pathApi(ctx.platform);
  const override = ctx.env.CODEX_HOME;
  return api.join(override && api.isAbsolute(override) ? override : api.join(ctx.homeDir, ".codex"), "config.toml");
}
function claudeConfigPath(ctx) {
  const api = pathApi(ctx.platform);
  const override = ctx.env.CLAUDE_CONFIG_DIR;
  return override && api.isAbsolute(override) ? api.join(override, ".claude.json") : api.join(ctx.homeDir, ".claude.json");
}
function minimalEnv(ctx, extra = {}) {
  if (ctx.platform === "win32") {
    const systemRoot = ctx.env.SystemRoot ?? "C:\\Windows";
    return { SystemRoot: systemRoot, PATH: path2.win32.join(systemRoot, "System32"), ...extra };
  }
  return { ...extra };
}
function httpTokenPath(ctx) {
  return pathApi(ctx.platform).join(ctx.stateDir, "http-bearer.token");
}

// src/installer/bundle.ts
var ARCHIVE_SCHEMA = "convyy-mcp-archive.v1";
var CHANNEL_SCHEMA = "convyy-mcp-channel.v1";
var MANIFEST_FILE = "manifest.json";
var ALLOWED_FILE_PATTERNS = [
  /^runtime\/(node|node\.exe|LICENSE)$/,
  /^app\/(server|installer)\.js$/,
  /^app\/dev\/devRelayCli\.js$/,
  /^app\/package\.json$/,
  /^(LICENSE|NOTICE|INSTALL\.md)$/
];
var CHANNEL_FILE_PATTERNS = [
  /^(server|installer)\.js$/,
  /^dev\/devRelayCli\.js$/,
  /^package\.json$/,
  /^(LICENSE|NOTICE)$/
];
var BundleError = class extends Error {
  code;
  problems;
  constructor(code2, message, problems = []) {
    super(message);
    this.name = "BundleError";
    this.code = code2;
    this.problems = problems;
  }
};
function sha256File(file) {
  return createHash("sha256").update(fs2.readFileSync(file)).digest("hex");
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseManifest(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new BundleError("bad_manifest", "manifest.json is not valid JSON.");
  }
  if (!isRecord2(value) || value.schema !== ARCHIVE_SCHEMA && value.schema !== CHANNEL_SCHEMA || value.name !== "convyy-mcp") {
    throw new BundleError("bad_manifest", `manifest.json is not a ${ARCHIVE_SCHEMA} or ${CHANNEL_SCHEMA} manifest.`);
  }
  const { versions, runtime, files, source } = value;
  const isChannel = value.schema === CHANNEL_SCHEMA;
  const safeName = /^[0-9A-Za-z][0-9A-Za-z._-]*$/;
  const ok = isRecord2(versions) && typeof versions.package === "string" && safeName.test(versions.package) && (versions.build === void 0 || typeof versions.build === "string" && safeName.test(versions.build)) && typeof versions.relayProtocol === "string" && typeof versions.relayRevision === "number" && isRecord2(versions.toolContract) && Array.isArray(versions.toolContract.tools) && (isChannel ? runtime === null && value.channel === "git" && value.platform === "any" : isRecord2(runtime) && typeof runtime.entry === "string" && typeof runtime.version === "string" && isRecord2(source) && typeof value.platform === "string" && (value.channel === "candidate" || value.channel === "release")) && typeof value.entry === "string" && typeof value.installer === "string" && isRecord2(files) && Object.values(files).every((hash) => typeof hash === "string" && /^[0-9a-f]{64}$/.test(hash));
  if (!ok) {
    throw new BundleError("bad_manifest", "manifest.json is missing required fields or has malformed ones.");
  }
  return value;
}
function bundleKey(manifest) {
  return manifest.versions.build ? `${manifest.versions.package}-${manifest.versions.build}` : manifest.versions.package;
}
function readBundleManifest(bundleDir) {
  const manifestPath = path3.join(bundleDir, MANIFEST_FILE);
  if (!fs2.existsSync(manifestPath)) {
    throw new BundleError("no_manifest", `No ${MANIFEST_FILE} in ${bundleDir}: this is not an extracted Convyy MCP archive.`);
  }
  return parseManifest(fs2.readFileSync(manifestPath, "utf8"));
}
function listTree(root, prefix = "") {
  return fs2.readdirSync(path3.join(root, prefix), { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) {
      return [relative];
    }
    return entry.isDirectory() ? listTree(root, relative) : [relative];
  });
}
function isSafeRelativePath(relative) {
  return relative.length > 0 && !relative.startsWith("/") && !relative.includes("\\") && !/^[A-Za-z]:/.test(relative) && !relative.split("/").some((part) => part === ".." || part === "." || part === "");
}
function verifyBundle(bundleDir, manifest, machine) {
  if (manifest.platform !== "any") {
    const here = detectPlatformId(machine.platform, machine.arch);
    if (here === null) {
      throw new BundleError("wrong_platform", `Convyy MCP is not shipped for ${machine.platform}-${machine.arch}.`);
    }
    if (manifest.platform !== here) {
      throw new BundleError("wrong_platform", `This archive is for ${manifest.platform}, this computer is ${here}.`);
    }
  }
  const allowed = manifest.runtime === null ? CHANNEL_FILE_PATTERNS : ALLOWED_FILE_PATTERNS;
  const problems = [];
  for (const [relative, expected] of Object.entries(manifest.files)) {
    if (!isSafeRelativePath(relative) || !allowed.some((pattern) => pattern.test(relative))) {
      problems.push(`${relative}: not an allowed file`);
      continue;
    }
    const absolute = path3.join(bundleDir, ...relative.split("/"));
    let stat;
    try {
      stat = fs2.lstatSync(absolute);
    } catch {
      problems.push(`${relative}: missing`);
      continue;
    }
    if (!stat.isFile()) {
      problems.push(`${relative}: not a regular file`);
    } else if (sha256File(absolute) !== expected) {
      problems.push(`${relative}: SHA-256 differs from the manifest`);
    }
  }
  for (const required of [manifest.entry, manifest.installer, ...manifest.runtime === null ? [] : [manifest.runtime.entry]]) {
    if (!(required in manifest.files)) {
      problems.push(`${required}: not listed in the manifest`);
    }
  }
  if (problems.length > 0) {
    throw new BundleError("tampered", `The archive does not match its manifest (${problems.length} problem(s)).`, problems);
  }
  const extras = listTree(bundleDir).filter((relative) => relative !== MANIFEST_FILE && !(relative in manifest.files));
  if (extras.length > 0) {
    throw new BundleError("unexpected_files", `The archive contains files its manifest does not list: ${extras.slice(0, 5).join(", ")}.`, extras);
  }
}

// src/installer/entry.ts
import fs3 from "node:fs";
var fsProbe = { exists: (file) => fs3.existsSync(file) };
function normalize(ctx, value) {
  const api = pathApi(ctx.platform);
  const normalized = api.normalize(value);
  return ctx.platform === "win32" ? normalized.toLowerCase() : normalized;
}
function isUnder(ctx, child, parent) {
  const api = pathApi(ctx.platform);
  const base = normalize(ctx, parent);
  const candidate = normalize(ctx, child);
  return candidate === base || candidate.startsWith(base.endsWith(api.sep) ? base : base + api.sep);
}
function isNodeCommand(ctx, command) {
  const base = pathApi(ctx.platform).basename(command).toLowerCase();
  return base === "node" || base === "node.exe";
}
function legacyScript(ctx, view, probe) {
  if (view.kind !== "stdio" || view.command === null || view.args === null || view.args.length !== 1) {
    return null;
  }
  if (!isNodeCommand(ctx, view.command)) {
    return null;
  }
  const api = pathApi(ctx.platform);
  const script = view.args[0];
  const normalized = script.replace(/\\/g, "/");
  if (!normalized.endsWith("/dist/server.js") || isUnder(ctx, script, versionsDir(ctx))) {
    return null;
  }
  const distDir = api.dirname(script);
  const looksLikeConvyy = probe.exists(api.join(distDir, "dev", "devRelayCli.js")) || normalized.split("/").some((part) => /convyy|^orc$|^mcp$/i.test(part));
  return looksLikeConvyy ? script : null;
}
function classifyStdioEntry(ctx, view, spec, probe = fsProbe) {
  if (view === null) {
    return { cls: "absent", reason: null };
  }
  if (view.kind !== "stdio" || view.command === null || view.args === null) {
    return {
      cls: "ambiguous",
      reason: view.note ?? "The existing `convyy` entry is not a plain command entry, so it is not safe to replace."
    };
  }
  const sameCommand = normalize(ctx, view.command) === normalize(ctx, spec.command);
  const sameArgs = view.args.length === spec.args.length && view.args.every((arg, index) => normalize(ctx, arg) === normalize(ctx, spec.args[index]));
  if (sameCommand && sameArgs) {
    return view.drift.length === 0 ? { cls: "current", reason: null } : { cls: "outdated", reason: `Settings differ from the installed ones: ${view.drift.join(", ")}.` };
  }
  const root = versionsDir(ctx);
  if ((isUnder(ctx, view.command, root) || isNodeCommand(ctx, view.command)) && view.args.length > 0 && view.args.every((arg) => isUnder(ctx, arg, root))) {
    return { cls: "outdated", reason: "The entry points to another installed version of Convyy MCP." };
  }
  const script = legacyScript(ctx, view, probe);
  if (script !== null) {
    return { cls: "legacy", reason: `The entry starts the old connector from a checkout (${script}).` };
  }
  return {
    cls: "ambiguous",
    reason: `The existing \`convyy\` entry starts \`${view.command}${view.args.length > 0 ? ` ${view.args.join(" ")}` : ""}\`, which is not a Convyy install this tool recognises.`
  };
}
function similarEntryDiagnostic(name, where) {
  return {
    level: "warning",
    code: "similar_entry",
    message: `${where} has another entry named \`${name}\` that starts a Convyy connector. It was not changed; remove it by hand if it is a duplicate.`
  };
}

// src/installer/clients/claude.ts
var CLAUDE_SERVER_NAME = "convyy";
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function viewOf(entry) {
  if (!isObject(entry)) {
    return { kind: "other", command: null, args: null, drift: [], note: "The existing `convyy` entry is not an object." };
  }
  const { type, command, args } = entry;
  const stdio = (type === void 0 || type === "stdio") && typeof command === "string";
  if (!stdio) {
    return { kind: "other", command: null, args: null, drift: [], note: "The existing `convyy` entry is not a plain command (stdio) entry." };
  }
  if (args !== void 0 && !(Array.isArray(args) && args.every((arg) => typeof arg === "string"))) {
    return { kind: "other", command: null, args: null, drift: [], note: "The existing `convyy` entry has unreadable `args`." };
  }
  return {
    kind: "stdio",
    command,
    args: args ?? [],
    drift: type === "stdio" ? [] : ["type"],
    note: null
  };
}
function detectIndent(text) {
  const match = /^[ \t]+(?=")/m.exec(text);
  return match ? match[0] : 2;
}
function newEntry(spec, previous, keepExtras) {
  const base = keepExtras && isObject(previous) ? { ...previous } : { env: {} };
  return { ...base, type: "stdio", command: spec.command, args: [...spec.args] };
}
function planClaude(text, input) {
  const probe = input.probe ?? fsProbe;
  const bom = text?.startsWith("\uFEFF") ? "\uFEFF" : "";
  const source = text === null ? "" : text.slice(bom.length);
  let root;
  if (source.trim() === "") {
    root = {};
  } else {
    let parsed;
    try {
      parsed = JSON.parse(source);
    } catch {
      return {
        cls: "ambiguous",
        reason: "~/.claude.json is not valid JSON, so it was not changed. Repair the file or add the server with `claude mcp add` (see INSTALL.md).",
        diagnostics: [],
        next: null,
        migrated: []
      };
    }
    if (!isObject(parsed)) {
      return { cls: "ambiguous", reason: "~/.claude.json is not a JSON object, so it was not changed.", diagnostics: [], next: null, migrated: [] };
    }
    root = parsed;
  }
  if (root.mcpServers !== void 0 && !isObject(root.mcpServers)) {
    return { cls: "ambiguous", reason: "`mcpServers` in ~/.claude.json is not an object, so it was not changed.", diagnostics: [], next: null, migrated: [] };
  }
  const servers = root.mcpServers ?? {};
  const diagnostics = [];
  for (const [name, entry] of Object.entries(servers)) {
    if (name !== CLAUDE_SERVER_NAME && classifyStdioEntry(input.ctx, viewOf(entry), input.spec, probe).cls === "legacy") {
      diagnostics.push(similarEntryDiagnostic(name, "~/.claude.json"));
    }
  }
  const migrate = [];
  if (isObject(root.projects)) {
    for (const [projectPath, project] of Object.entries(root.projects)) {
      const projectServers = isObject(project) && isObject(project.mcpServers) ? project.mcpServers : null;
      if (projectServers && CLAUDE_SERVER_NAME in projectServers) {
        const verdict2 = classifyStdioEntry(input.ctx, viewOf(projectServers[CLAUDE_SERVER_NAME]), input.spec, probe);
        if (verdict2.cls === "legacy") {
          migrate.push(projectPath);
        } else if (verdict2.cls !== "current") {
          diagnostics.push({
            level: "warning",
            code: "project_entry_untouched",
            message: `The project-scope \`convyy\` entry for ${projectPath} is not the old connector, so it was left as it is (${verdict2.reason ?? "unrecognised"}).`
          });
        }
      }
    }
  }
  const exists = CLAUDE_SERVER_NAME in servers;
  const verdict = classifyStdioEntry(input.ctx, exists ? viewOf(servers[CLAUDE_SERVER_NAME]) : null, input.spec, probe);
  if (verdict.cls === "current" && migrate.length === 0) {
    return { cls: "current", reason: null, diagnostics, next: null, migrated: [] };
  }
  if (verdict.cls === "ambiguous" && !input.replaceAmbiguous) {
    return { ...verdict, diagnostics, next: null, migrated: [] };
  }
  if (verdict.cls !== "current") {
    servers[CLAUDE_SERVER_NAME] = newEntry(input.spec, servers[CLAUDE_SERVER_NAME], verdict.cls !== "ambiguous");
    root.mcpServers = servers;
  }
  for (const projectPath of migrate) {
    const projectServers = root.projects[projectPath];
    const mcpServers = projectServers.mcpServers;
    mcpServers[CLAUDE_SERVER_NAME] = newEntry(input.spec, mcpServers[CLAUDE_SERVER_NAME], true);
  }
  const trailingNewline = source.endsWith("\n") || source === "";
  const next = bom + JSON.stringify(root, null, detectIndent(source)) + (trailingNewline ? "\n" : "");
  return { ...verdict, diagnostics, next, migrated: migrate };
}

// src/installer/toml.ts
var TomlSyntaxError = class extends Error {
};
function skipSpaces(text, index) {
  let cursor = index;
  while (cursor < text.length && (text[cursor] === " " || text[cursor] === "	")) {
    cursor += 1;
  }
  return cursor;
}
function lineEnd(text, index) {
  const newline = text.indexOf("\n", index);
  return newline < 0 ? text.length : newline + 1;
}
function readKeyPath(text, index, stop) {
  const parts = [];
  let cursor = skipSpaces(text, index);
  for (; ; ) {
    const char = text[cursor];
    if (char === '"' || char === "'") {
      const { value, next } = readQuoted(text, cursor);
      parts.push(value);
      cursor = next;
    } else {
      const begin = cursor;
      while (cursor < text.length && /[A-Za-z0-9_-]/.test(text[cursor])) {
        cursor += 1;
      }
      if (cursor === begin) {
        throw new TomlSyntaxError("bad key");
      }
      parts.push(text.slice(begin, cursor));
    }
    cursor = skipSpaces(text, cursor);
    if (text[cursor] === ".") {
      cursor = skipSpaces(text, cursor + 1);
      continue;
    }
    if (cursor >= text.length || stop(text[cursor])) {
      return { parts, next: cursor };
    }
    throw new TomlSyntaxError("bad key");
  }
}
function readQuoted(text, index) {
  const quote = text[index];
  const triple = text.startsWith(quote.repeat(3), index);
  if (triple) {
    const close = text.indexOf(quote.repeat(3), index + 3);
    if (close < 0) {
      throw new TomlSyntaxError("unterminated multi-line string");
    }
    return { value: unescape(text.slice(index + 3, close), quote), next: close + 3 };
  }
  let cursor = index + 1;
  while (cursor < text.length && text[cursor] !== quote && text[cursor] !== "\n") {
    if (quote === '"' && text[cursor] === "\\") {
      cursor += 1;
    }
    cursor += 1;
  }
  if (text[cursor] !== quote) {
    throw new TomlSyntaxError("unterminated string");
  }
  return { value: unescape(text.slice(index + 1, cursor), quote), next: cursor + 1 };
}
function unescape(raw, quote) {
  if (quote === "'") {
    return raw;
  }
  return raw.replace(/\\(u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8}|.)/g, (_match, code2) => {
    switch (code2[0]) {
      case "b":
        return "\b";
      case "t":
        return "	";
      case "n":
        return "\n";
      case "f":
        return "\f";
      case "r":
        return "\r";
      case '"':
        return '"';
      case "\\":
        return "\\";
      case "u":
      case "U":
        return String.fromCodePoint(Number.parseInt(code2.slice(1), 16));
      default:
        throw new TomlSyntaxError("bad escape");
    }
  });
}
function scanValueEnd(text, index) {
  let depth = 0;
  let cursor = index;
  while (cursor < text.length) {
    const char = text[cursor];
    if (char === '"' || char === "'") {
      cursor = readQuoted(text, cursor).next;
      continue;
    }
    if (char === "#") {
      const next = text.indexOf("\n", cursor);
      cursor = next < 0 ? text.length : next;
      continue;
    }
    if (char === "[" || char === "{") {
      depth += 1;
    } else if (char === "]" || char === "}") {
      depth -= 1;
    } else if (char === "\n" && depth <= 0) {
      return cursor + 1;
    }
    cursor += 1;
  }
  return text.length;
}
function scanToml(text) {
  const statements = [];
  let cursor = 0;
  while (cursor < text.length) {
    const start = cursor;
    const first = skipSpaces(text, cursor);
    const char = text[first];
    if (first >= text.length || char === "\n" || char === "\r" || char === "#") {
      cursor = lineEnd(text, first);
      statements.push({ kind: "blank", start, end: cursor, path: [], arrayTable: false, value: "", valueStart: first });
      continue;
    }
    if (char === "[") {
      const arrayTable = text[first + 1] === "[";
      const { parts: parts2, next: next2 } = readKeyPath(text, first + (arrayTable ? 2 : 1), (c) => c === "]");
      let close = next2 + 1;
      if (arrayTable) {
        if (text[close] !== "]") {
          throw new TomlSyntaxError("bad array-of-tables header");
        }
        close += 1;
      }
      cursor = lineEnd(text, close);
      statements.push({ kind: "header", start, end: cursor, path: parts2, arrayTable, value: "", valueStart: close });
      continue;
    }
    const { parts, next } = readKeyPath(text, first, (c) => c === "=");
    if (text[next] !== "=") {
      throw new TomlSyntaxError("expected =");
    }
    const valueStart = skipSpaces(text, next + 1);
    const end = scanValueEnd(text, valueStart);
    let rawEnd = end;
    while (rawEnd > valueStart && (text[rawEnd - 1] === "\n" || text[rawEnd - 1] === "\r")) {
      rawEnd -= 1;
    }
    cursor = end;
    statements.push({ kind: "pair", start, end, path: parts, arrayTable: false, value: text.slice(valueStart, rawEnd), valueStart });
  }
  return statements;
}
function parseTomlString(raw) {
  const text = raw.trim();
  if (text[0] !== '"' && text[0] !== "'") {
    return null;
  }
  try {
    const { value, next } = readQuoted(text, 0);
    const rest = text.slice(next).trim();
    return rest === "" || rest.startsWith("#") ? value : null;
  } catch {
    return null;
  }
}
function parseTomlStringArray(raw) {
  const text = raw.trim();
  if (text[0] !== "[") {
    return null;
  }
  const items = [];
  let cursor = 1;
  try {
    for (; ; ) {
      while (cursor < text.length && /[\s,]/.test(text[cursor])) {
        cursor += 1;
      }
      if (text[cursor] === "#") {
        const next2 = text.indexOf("\n", cursor);
        cursor = next2 < 0 ? text.length : next2;
        continue;
      }
      if (text[cursor] === "]") {
        const rest = text.slice(cursor + 1).trim();
        return rest === "" || rest.startsWith("#") ? items : null;
      }
      if (text[cursor] !== '"' && text[cursor] !== "'") {
        return null;
      }
      const { value, next } = readQuoted(text, cursor);
      items.push(value);
      cursor = next;
    }
  } catch {
    return null;
  }
}
function tomlString(value) {
  return JSON.stringify(value);
}
function tomlStringArray(values) {
  return `[${values.map(tomlString).join(", ")}]`;
}
function detectNewline(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

// src/installer/clients/codex.ts
var CODEX_SERVER_NAME = "convyy";
var CODEX_APPROVAL_MODE = "approve";
var MANAGED_KEYS = ["command", "args", "default_tools_approval_mode"];
function layoutOf(text) {
  const statements = scanToml(text);
  const layout = { statements, rootPairs: [], tables: /* @__PURE__ */ new Map(), duplicates: /* @__PURE__ */ new Set() };
  let current = null;
  for (const statement of statements) {
    if (statement.kind === "header") {
      if (current) {
        current.end = statement.start;
      }
      const key = JSON.stringify(statement.path);
      current = { header: statement, pairs: [], end: text.length };
      if (layout.tables.has(key) || statement.arrayTable) {
        layout.duplicates.add(key);
      }
      layout.tables.set(key, current);
    } else if (statement.kind === "pair") {
      (current ? current.pairs : layout.rootPairs).push(statement);
    }
  }
  return layout;
}
var SERVER_TABLE = JSON.stringify(["mcp_servers", CODEX_SERVER_NAME]);
function viewOf2(table) {
  const byKey = /* @__PURE__ */ new Map();
  for (const pair of table.pairs) {
    if (pair.path.length === 1) {
      byKey.set(pair.path[0], pair);
    } else if (pair.path.length > 1 && MANAGED_KEYS.includes(pair.path[0])) {
      return { view: emptyView("other", "A managed key is written in dotted form."), ambiguous: "A managed key of `[mcp_servers.convyy]` is written in dotted form." };
    }
  }
  if (byKey.has("url")) {
    return { view: emptyView("other", "The existing `convyy` entry is a URL server, not a command."), ambiguous: null };
  }
  const commandPair = byKey.get("command");
  const argsPair = byKey.get("args");
  const command = commandPair ? parseTomlString(commandPair.value) : null;
  const args = argsPair ? parseTomlStringArray(argsPair.value) : [];
  if (commandPair === void 0 || command === null || args === null) {
    return { view: emptyView("other", "The existing `convyy` entry has no readable `command`/`args`."), ambiguous: null };
  }
  const approvalPair = byKey.get("default_tools_approval_mode");
  const approval = approvalPair ? parseTomlString(approvalPair.value) : null;
  const drift = approval === CODEX_APPROVAL_MODE ? [] : ["default_tools_approval_mode"];
  return { view: { kind: "stdio", command, args, drift, note: null }, ambiguous: null };
}
function emptyView(kind, note) {
  return { kind, command: null, args: null, drift: [], note };
}
function conflictingForms(layout) {
  for (const pair of layout.rootPairs) {
    if (pair.path[0] === "mcp_servers" && (pair.path.length === 1 || pair.path[1] === CODEX_SERVER_NAME)) {
      return pair.path.length === 1 ? "`mcp_servers` is written as an inline table, which cannot be extended safely." : "`mcp_servers.convyy` is written with dotted keys at the top of the file.";
    }
  }
  const servers = layout.tables.get(JSON.stringify(["mcp_servers"]));
  if (servers?.pairs.some((pair) => pair.path[0] === CODEX_SERVER_NAME)) {
    return "`convyy` is written inline inside `[mcp_servers]`.";
  }
  if (layout.duplicates.has(SERVER_TABLE)) {
    return "`[mcp_servers.convyy]` is defined more than once.";
  }
  return null;
}
function similarEntries(layout) {
  const found = [];
  for (const [key, table] of layout.tables) {
    const parts = JSON.parse(key);
    if (parts.length !== 2 || parts[0] !== "mcp_servers" || parts[1] === CODEX_SERVER_NAME) {
      continue;
    }
    const { view } = viewOf2(table);
    if (view.kind === "stdio" && view.args !== null && view.args.some((arg) => arg.replace(/\\/g, "/").endsWith("/dist/server.js"))) {
      found.push(similarEntryDiagnostic(parts[1], "config.toml"));
    }
  }
  return found;
}
var managedLine = (key, spec) => {
  switch (key) {
    case "command":
      return `command = ${tomlString(spec.command)}`;
    case "args":
      return `args = ${tomlStringArray(spec.args)}`;
    default:
      return `default_tools_approval_mode = ${tomlString(CODEX_APPROVAL_MODE)}`;
  }
};
function freshBlock(spec, newline) {
  return [
    `[mcp_servers.${CODEX_SERVER_NAME}]`,
    ...MANAGED_KEYS.map((key) => managedLine(key, spec))
  ].join(newline) + newline;
}
function apply(text, layout, spec, replaceWholeTable) {
  const newline = detectNewline(text);
  const table = layout.tables.get(SERVER_TABLE);
  if (!table) {
    const base = text.length === 0 || text.endsWith("\n") ? text : text + newline;
    const gap = base.length === 0 || base.endsWith(newline + newline) ? "" : newline;
    return base + gap + freshBlock(spec, newline);
  }
  if (replaceWholeTable) {
    return text.slice(0, table.header.start) + freshBlock(spec, newline) + text.slice(table.end);
  }
  const edits = [];
  const missing = [];
  for (const key of MANAGED_KEYS) {
    const pair = table.pairs.find((candidate) => candidate.path.length === 1 && candidate.path[0] === key);
    if (pair) {
      const endsWithBreak = text.slice(pair.start, pair.end).endsWith("\n");
      edits.push({ start: pair.start, end: pair.end, text: managedLine(key, spec) + (endsWithBreak ? newline : "") });
    } else {
      missing.push(managedLine(key, spec));
    }
  }
  if (missing.length > 0) {
    const anchor = table.pairs.length > 0 ? table.pairs[table.pairs.length - 1].end : table.header.end;
    const needsBreak = anchor > 0 && !text.slice(0, anchor).endsWith("\n");
    edits.push({ start: anchor, end: anchor, text: (needsBreak ? newline : "") + missing.join(newline) + newline });
  }
  let result = text;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}
function planCodex(text, input) {
  const source = text ?? "";
  const probe = input.probe ?? fsProbe;
  let layout;
  try {
    layout = layoutOf(source);
  } catch (error) {
    if (error instanceof TomlSyntaxError) {
      return {
        cls: "ambiguous",
        reason: "config.toml could not be read safely; it was not changed. Fix the file or add the server by hand (see INSTALL.md).",
        diagnostics: [],
        next: null,
        migrated: []
      };
    }
    throw error;
  }
  const diagnostics = similarEntries(layout);
  const conflict = conflictingForms(layout);
  const table = layout.tables.get(SERVER_TABLE);
  const parsed = table ? viewOf2(table) : null;
  const classification = conflict !== null ? { cls: "ambiguous", reason: conflict } : parsed?.ambiguous ? { cls: "ambiguous", reason: parsed.ambiguous } : classifyStdioEntry(input.ctx, parsed?.view ?? null, input.spec, probe);
  const subTableOnly = !table && [...layout.tables.values()].some(
    (candidate) => candidate.header.path[0] === "mcp_servers" && candidate.header.path[1] === CODEX_SERVER_NAME
  );
  if (subTableOnly) {
    return {
      cls: "ambiguous",
      reason: "`mcp_servers.convyy` is defined only through sub-tables.",
      diagnostics,
      next: null,
      migrated: []
    };
  }
  if (classification.cls === "current") {
    return { cls: "current", reason: null, diagnostics, next: null, migrated: [] };
  }
  if (classification.cls === "ambiguous") {
    if (!input.replaceAmbiguous || conflict !== null) {
      return { ...classification, diagnostics, next: null, migrated: [] };
    }
    return { ...classification, diagnostics, next: apply(source, layout, input.spec, true), migrated: [] };
  }
  return { ...classification, diagnostics, next: apply(source, layout, input.spec, false), migrated: [] };
}

// src/installer/clients/openWebUi.ts
var OPEN_WEBUI_SERVER_ID = "convyy";
function isObject2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function desiredEntry(http) {
  return {
    url: http.url,
    path: "",
    type: "mcp",
    auth_type: "bearer",
    key: http.token,
    // Private to the admin who connected it; widening access is a decision for the owner of that Open WebUI.
    config: { enable: true, access_control: { read: { group_ids: [], user_ids: [] }, write: { group_ids: [], user_ids: [] } } },
    info: { id: OPEN_WEBUI_SERVER_ID, name: "Convyy", description: "Draw on and read the open Convyy board." }
  };
}
function idOf(entry) {
  return isObject2(entry) && isObject2(entry.info) ? entry.info.id : void 0;
}
function planOpenWebUi(text, input) {
  let connections;
  if (text === null || text.trim() === "") {
    connections = [];
  } else {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { cls: "ambiguous", reason: "Open WebUI returned a connection list that is not valid JSON; nothing was changed.", diagnostics: [], next: null, migrated: [] };
    }
    if (!Array.isArray(parsed)) {
      return { cls: "ambiguous", reason: "Open WebUI returned a connection list in an unexpected shape; nothing was changed.", diagnostics: [], next: null, migrated: [] };
    }
    connections = parsed;
  }
  const index = connections.findIndex((entry) => idOf(entry) === OPEN_WEBUI_SERVER_ID);
  const serialize = (list) => JSON.stringify(list, null, 2);
  if (index < 0) {
    return { cls: "absent", reason: null, diagnostics: [], next: serialize([...connections, desiredEntry(input.http)]), migrated: [] };
  }
  const existing = connections[index];
  if (existing.type !== "mcp") {
    const reason = "A connection with the id `convyy` already exists but is not an MCP tool server (an old mcpo/OpenAPI entry?).";
    if (!input.replaceAmbiguous) {
      return { cls: "ambiguous", reason, diagnostics: [], next: null, migrated: [] };
    }
    const replaced = [...connections];
    replaced[index] = desiredEntry(input.http);
    return { cls: "ambiguous", reason, diagnostics: [], next: serialize(replaced), migrated: [] };
  }
  if (existing.url === input.http.url && existing.key === input.http.token && existing.auth_type === "bearer") {
    return { cls: "current", reason: null, diagnostics: [], next: null, migrated: [] };
  }
  const updated = [...connections];
  updated[index] = { ...existing, url: input.http.url, auth_type: "bearer", key: input.http.token };
  return {
    cls: "outdated",
    reason: "The Convyy connection points to another endpoint or token.",
    diagnostics: [],
    next: serialize(updated),
    migrated: []
  };
}

// src/installer/connectorCheck.ts
import { spawn } from "node:child_process";
function checkConnector(ctx, spec, expectedTools, timeoutMs = 15e3) {
  return new Promise((resolve) => {
    let settled = false;
    let stderr = "";
    let buffer = "";
    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      child.kill();
      resolve(result);
    };
    const child = spawn(spec.command, [...spec.args, "--no-relay"], {
      env: minimalEnv(ctx),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    const timer = setTimeout(
      () => finish({ ok: false, tools: [], error: `The connector did not answer within ${timeoutMs} ms.${stderr ? ` ${stderr.trim().slice(0, 300)}` : ""}` }),
      timeoutMs
    );
    child.on("error", (error) => finish({ ok: false, tools: [], error: `The connector could not start: ${error.message}` }));
    child.on("exit", (code2) => finish({ ok: false, tools: [], error: `The connector exited with code ${code2 ?? "?"} before answering.${stderr ? ` ${stderr.trim().slice(0, 300)}` : ""}` }));
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) {
          continue;
        }
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        if (message.id === 2) {
          const tools = (message.result?.tools ?? []).map((tool) => tool.name).sort();
          const expected = [...expectedTools].sort();
          const same = tools.length === expected.length && tools.every((name, index) => name === expected[index]);
          finish(same ? { ok: true, tools, error: null } : { ok: false, tools, error: `The connector lists ${tools.length} tool(s) (${tools.join(", ")}), the manifest promises ${expected.length}.` });
        }
      }
    });
    const send = (message) => child.stdin.write(`${JSON.stringify(message)}
`);
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "convyy-installer-check", version: "1" } } });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  });
}

// src/installer/fsx.ts
import { randomBytes } from "node:crypto";
import fs4 from "node:fs";
import path4 from "node:path";
function ensurePrivateDir(dir) {
  fs4.mkdirSync(dir, { recursive: true, mode: 448 });
}
function resolveWriteTarget(file) {
  try {
    return fs4.realpathSync(file);
  } catch {
    return file;
  }
}
function readTextIfExists(file) {
  try {
    return fs4.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
function atomicWriteText(file, text, defaultMode = 384) {
  const target = resolveWriteTarget(file);
  fs4.mkdirSync(path4.dirname(target), { recursive: true });
  let mode = defaultMode;
  try {
    mode = fs4.statSync(target).mode & 511;
  } catch {
  }
  const temporary = `${target}.convyy-${randomBytes(6).toString("hex")}.tmp`;
  const handle = fs4.openSync(temporary, "wx", mode);
  try {
    fs4.writeSync(handle, text);
    fs4.fsyncSync(handle);
  } finally {
    fs4.closeSync(handle);
  }
  try {
    fs4.renameSync(temporary, target);
  } catch (error) {
    fs4.rmSync(temporary, { force: true });
    throw error;
  }
}
function copyTree(from, to) {
  fs4.mkdirSync(to, { recursive: true });
  for (const entry of fs4.readdirSync(from, { withFileTypes: true })) {
    const source = path4.join(from, entry.name);
    const target = path4.join(to, entry.name);
    if (entry.isDirectory()) {
      copyTree(source, target);
    } else if (entry.isFile()) {
      fs4.copyFileSync(source, target);
      fs4.chmodSync(target, fs4.statSync(source).mode & 511);
    }
  }
}
function removeTree(dir) {
  fs4.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
}
var LOCK_STALE_MS = 10 * 60 * 1e3;
function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}
var InstallLockedError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "InstallLockedError";
  }
};
function acquireInstallLock(ctx) {
  const lockPath = installLockPath(ctx);
  ensurePrivateDir(path4.dirname(lockPath));
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = fs4.openSync(lockPath, "wx", 384);
      fs4.writeSync(handle, JSON.stringify({ pid: process.pid, at: Date.now() }));
      fs4.closeSync(handle);
      return () => fs4.rmSync(lockPath, { force: true });
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
      let holder = {};
      try {
        holder = JSON.parse(fs4.readFileSync(lockPath, "utf8"));
      } catch {
      }
      const stale = typeof holder.pid !== "number" || !processAlive(holder.pid) || typeof holder.at !== "number" || Date.now() - holder.at > LOCK_STALE_MS;
      if (!stale) {
        throw new InstallLockedError("Another Convyy MCP install is running. Wait for it to finish and run this again.");
      }
      fs4.rmSync(lockPath, { force: true });
    }
  }
  throw new InstallLockedError("Could not take the Convyy MCP install lock.");
}
var BACKUP_KEEP = 10;
function createBackup(ctx, client, target, text, now) {
  const dir = backupsDir(ctx);
  ensurePrivateDir(dir);
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const id = `${stamp}-${client}-${randomBytes(3).toString("hex")}`;
  let file = null;
  if (text !== null) {
    file = path4.join(dir, `${id}.bak`);
    fs4.writeFileSync(file, text, { mode: 384 });
  }
  const record = { id, client, file, target, createdAt: now.toISOString() };
  fs4.writeFileSync(path4.join(dir, `${id}.json`), JSON.stringify(record, null, 2), { mode: 384 });
  pruneBackups(dir, client);
  return record;
}
function pruneBackups(dir, client) {
  const records = fs4.readdirSync(dir).filter((name) => name.endsWith(".json") && name.includes(`-${client}-`)).sort();
  for (const name of records.slice(0, Math.max(0, records.length - BACKUP_KEEP))) {
    const id = name.slice(0, -".json".length);
    fs4.rmSync(path4.join(dir, name), { force: true });
    fs4.rmSync(path4.join(dir, `${id}.bak`), { force: true });
  }
}
function readBackupText(record) {
  return record.file === null ? null : fs4.readFileSync(record.file, "utf8");
}

// src/installer/httpDaemon.ts
import { spawn as spawn2 } from "node:child_process";
import { randomBytes as randomBytes2 } from "node:crypto";
import fs5 from "node:fs";
var DEFAULT_HTTP_PORT = 4319;
async function probeHttpEndpoint(port, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) });
  } catch {
    return { state: "down", version: null };
  }
  try {
    const body = await response.json();
    if (body.ok === true && body.service === "convyy-mcp-http") {
      return { state: "ours", version: body.version ?? null };
    }
  } catch {
  }
  return { state: "foreign", version: null };
}
function ensureHttpToken(ctx) {
  const tokenPath = httpTokenPath(ctx);
  try {
    const existing = fs5.readFileSync(tokenPath, "utf8").trim();
    if (existing.length >= 24) {
      return { token: existing, path: tokenPath, created: false };
    }
  } catch {
  }
  ensurePrivateDir(pathApi(ctx.platform).dirname(tokenPath));
  const token = randomBytes2(32).toString("base64url");
  fs5.writeFileSync(tokenPath, token, { mode: 384 });
  if (ctx.platform !== "win32") {
    fs5.chmodSync(tokenPath, 384);
  }
  return { token, path: tokenPath, created: true };
}
function daemonEnv(ctx) {
  const extra = {};
  for (const name of ["HOME", "USERPROFILE", "LOCALAPPDATA", "XDG_STATE_HOME", "CONVYY_MCP_STATE_DIR"]) {
    const value = ctx.env[name];
    if (value) {
      extra[name] = value;
    }
  }
  return minimalEnv(ctx, extra);
}
async function waitForOurs(port, fetchImpl, attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if ((await probeHttpEndpoint(port, fetchImpl)).state === "ours") {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}
async function ensureHttpDaemon(options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const spawnImpl = options.spawnImpl ?? spawn2;
  const probe = await probeHttpEndpoint(options.port, fetchImpl);
  if (probe.state === "foreign") {
    return { state: "blocked", message: `Port ${options.port} is used by something that is not the Convyy endpoint; pick another with --open-webui-port. It was not touched.` };
  }
  let restarted = false;
  if (probe.state === "ours") {
    if (probe.version === options.version) {
      return { state: "running", message: null };
    }
    try {
      await fetchImpl(`http://127.0.0.1:${options.port}/admin/shutdown`, {
        method: "POST",
        headers: { Authorization: `Bearer ${options.token}` },
        signal: AbortSignal.timeout(2e3)
      });
    } catch {
    }
    for (let attempt = 0; attempt < 30 && (await probeHttpEndpoint(options.port, fetchImpl)).state !== "down"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if ((await probeHttpEndpoint(options.port, fetchImpl)).state !== "down") {
      return { state: "failed", message: "The running Convyy endpoint is of another version and did not stop (its token may have changed). Stop it and run the installer again." };
    }
    restarted = true;
  }
  const child = spawnImpl(
    options.runtime,
    [options.script, "--http", "--listen-port", String(options.port), "--port", String(options.relayPort), "--token-file", options.tokenPath, "--version-label", options.version],
    { detached: true, stdio: "ignore", env: daemonEnv(options.ctx), windowsHide: true }
  );
  child.unref();
  if (!await waitForOurs(options.port, fetchImpl)) {
    return { state: "failed", message: `The Convyy endpoint did not come up on 127.0.0.1:${options.port}.` };
  }
  return { state: restarted ? "restarted" : "started", message: null };
}

// src/installer/nodeRuntime.ts
import { execFile } from "node:child_process";
import { createHash as createHash2, randomBytes as randomBytes3 } from "node:crypto";
import fs6 from "node:fs";
import path5 from "node:path";

// src/installer/node-runtime.json
var node_runtime_default = {
  minMajor: 20,
  download: {
    version: "v24.22.0",
    baseUrl: "https://nodejs.org/dist",
    archives: {
      "darwin-arm64": { file: "node-v24.22.0-darwin-arm64.tar.gz", sha256: "6a9724d9b50a5f22b4816cded441b5a8d9ddae546191a5e5b7efa5a5e2ee26d5", binary: "bin/node" },
      "darwin-x64": { file: "node-v24.22.0-darwin-x64.tar.gz", sha256: "495e3f273c645f3c4677d438304cdfc701729ea5dec5728f5c8e76a2dece4b91", binary: "bin/node" },
      "win-x64": { file: "node-v24.22.0-win-x64.zip", sha256: "f9683a19877e12a9b167305c8db71040d812876359de21f0d2e97c3f321f80c3", binary: "node.exe" }
    }
  }
};

// src/installer/nodeRuntime.ts
var MIN_NODE_MAJOR = node_runtime_default.minMajor;
var PINNED_NODE = node_runtime_default.download;
var MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;
var DOWNLOAD_TIMEOUT_MS = 10 * 6e4;
var NodeUnavailableError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "NodeUnavailableError";
  }
};
function parseNodeVersion(text) {
  const match = /^v(\d+)\.(\d+)\.(\d+)/.exec(text.trim());
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) } : null;
}
function nodeVersionFits(text, minMajor = MIN_NODE_MAJOR) {
  const parsed = text === null ? null : parseNodeVersion(text);
  return parsed !== null && parsed.major >= minMajor;
}
function downloadedNodeDir(ctx, version = PINNED_NODE.version) {
  return pathApi(ctx.platform).join(ctx.installRoot, "node", version);
}
function downloadedNodePath(ctx, version = PINNED_NODE.version) {
  return pathApi(ctx.platform).join(downloadedNodeDir(ctx, version), ctx.platform === "win32" ? "node.exe" : "node");
}
function runFile(file, args, env, timeoutMs) {
  return new Promise((resolve) => {
    execFile(file, args, { env, timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      resolve(error ? null : String(stdout));
    });
  });
}
function defaultProbe(ctx) {
  return async (file) => {
    const out = await runFile(file, ["--version"], minimalEnv(ctx), 8e3);
    return out === null ? null : out.trim();
  };
}
function isFile(file) {
  try {
    return fs6.statSync(file).isFile();
  } catch {
    return false;
  }
}
function stablePath(file) {
  if (/fnm_multishells/.test(file)) {
    try {
      return fs6.realpathSync(file);
    } catch {
      return file;
    }
  }
  return file;
}
function pathNodeCandidates(ctx) {
  const api = pathApi(ctx.platform);
  const raw = ctx.platform === "win32" ? Object.entries(ctx.env).find(([name]) => name.toLowerCase() === "path")?.[1] : ctx.env.PATH;
  const executable = ctx.platform === "win32" ? "node.exe" : "node";
  const seen = /* @__PURE__ */ new Set();
  const found = [];
  for (const dir of (raw ?? "").split(api.delimiter)) {
    const trimmed = dir.trim().replace(/^"|"$/g, "");
    if (trimmed === "" || !api.isAbsolute(trimmed)) {
      continue;
    }
    const candidate = stablePath(api.join(trimmed, executable));
    if (!seen.has(candidate) && isFile(candidate)) {
      seen.add(candidate);
      found.push(candidate);
    }
  }
  return found;
}
function tarProgram(ctx) {
  return ctx.platform === "win32" ? path5.win32.join(ctx.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
}
async function downloadPinnedNode(options, pinned, probe) {
  const { ctx } = options;
  const platformId = detectPlatformId(ctx.platform, ctx.arch);
  const archive = platformId === null ? void 0 : pinned.archives[platformId];
  if (platformId === null || archive === void 0) {
    throw new NodeUnavailableError(`There is no official Node.js download for ${ctx.platform}-${ctx.arch}. Install Node.js ${MIN_NODE_MAJOR} or newer from https://nodejs.org and run the installer again.`);
  }
  const url = `${pinned.baseUrl}/${pinned.version}/${archive.file}`;
  options.log?.(`No Node.js ${MIN_NODE_MAJOR}+ found. Downloading the official Node.js ${pinned.version} once (${url}) ...`);
  const fetchImpl = options.fetchImpl ?? fetch;
  let bytes;
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!response.ok) {
      throw new Error(`nodejs.org answered ${response.status}`);
    }
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_DOWNLOAD_BYTES) {
      throw new Error("the download is larger than expected");
    }
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_DOWNLOAD_BYTES) {
      throw new Error("the download is larger than expected");
    }
  } catch (error) {
    throw new NodeUnavailableError(`Could not download Node.js from ${url}: ${error instanceof Error ? error.message : "unknown error"}. Install Node.js ${MIN_NODE_MAJOR} or newer from https://nodejs.org and run the installer again.`);
  }
  const actual = createHash2("sha256").update(bytes).digest("hex");
  if (actual !== archive.sha256) {
    throw new NodeUnavailableError(`The downloaded ${archive.file} does not match the pinned SHA-256 (expected ${archive.sha256}, got ${actual}). It was discarded.`);
  }
  ensurePrivateDir(stagingDir(ctx));
  const work = path5.join(stagingDir(ctx), `node-${randomBytes3(4).toString("hex")}`);
  const target = downloadedNodeDir(ctx, pinned.version);
  const part = `${target}.part-${randomBytes3(4).toString("hex")}`;
  try {
    ensurePrivateDir(work);
    const archiveFile = path5.join(work, archive.file);
    fs6.writeFileSync(archiveFile, bytes);
    const top = archive.file.replace(/\.(tar\.gz|zip)$/, "");
    const executable = ctx.platform === "win32" ? "node.exe" : "node";
    await new Promise((resolve, reject) => {
      execFile(tarProgram(ctx), ["-xf", archiveFile, "-C", work, `${top}/${archive.binary}`, `${top}/LICENSE`], { windowsHide: true }, (error) => error ? reject(error) : resolve());
    });
    ensurePrivateDir(part);
    fs6.renameSync(path5.join(work, top, ...archive.binary.split("/")), path5.join(part, executable));
    fs6.renameSync(path5.join(work, top, "LICENSE"), path5.join(part, "LICENSE"));
    if (ctx.platform !== "win32") {
      fs6.chmodSync(path5.join(part, executable), 493);
    }
    const reported = await probe(path5.join(part, executable));
    if (reported !== pinned.version) {
      throw new Error(`the unpacked Node.js reports ${reported ?? "nothing"}, expected ${pinned.version}`);
    }
    removeTree(target);
    fs6.renameSync(part, target);
  } catch (error) {
    removeTree(part);
    throw new NodeUnavailableError(`Could not unpack the downloaded Node.js: ${error instanceof Error ? error.message : "unknown error"}.`);
  } finally {
    removeTree(work);
  }
  options.log?.(`Node.js ${pinned.version} is in ${target}; later installs reuse it.`);
  return downloadedNodePath(ctx, pinned.version);
}
async function resolveNode(options) {
  const { ctx } = options;
  const minMajor = options.minMajor ?? MIN_NODE_MAJOR;
  const pinned = options.pinned ?? PINNED_NODE;
  const probe = options.probeVersion ?? defaultProbe(ctx);
  const notes = [];
  const candidates = [...pathNodeCandidates(ctx)];
  if (options.execPath !== void 0 && !candidates.includes(options.execPath) && isFile(options.execPath)) {
    candidates.push(options.execPath);
  }
  for (const candidate of candidates) {
    const version = await probe(candidate);
    if (version !== null && nodeVersionFits(version, minMajor)) {
      if (/[\\/]\.(nvm|fnm|volta|asdf|nodenv)[\\/]|[\\/]nvm4w[\\/]/i.test(candidate)) {
        notes.push(`Using Node.js ${version} from ${candidate}, which a version manager controls. If you remove that version, run the installer again.`);
      }
      return { command: candidate, version, source: "system", pendingDownload: false, notes };
    }
    notes.push(version === null ? `${candidate} does not run, so it was not used.` : `Node.js ${version} at ${candidate} is older than the required ${minMajor}, so it was not used.`);
  }
  const own = downloadedNodePath(ctx, pinned.version);
  if (isFile(own)) {
    const version = await probe(own);
    if (version === pinned.version) {
      return { command: own, version, source: "convyy", pendingDownload: false, notes };
    }
    notes.push(`The Node.js kept in ${own} is damaged (${version ?? "does not run"}); it will be replaced.`);
  }
  if (!options.allowDownload) {
    return { command: own, version: pinned.version, source: "download", pendingDownload: true, notes };
  }
  const command = await downloadPinnedNode(options, pinned, probe);
  return { command, version: pinned.version, source: "download", pendingDownload: false, notes };
}

// src/installer/state.ts
import fs7 from "node:fs";
var STATE_SCHEMA = "convyy-mcp-install-state.v1";
function emptyState() {
  return { schema: STATE_SCHEMA, current: null, previous: null, clients: {}, openWebUi: null, updatedAt: null };
}
function readState(ctx) {
  const text = readTextIfExists(installStatePath(ctx));
  if (text === null) {
    return emptyState();
  }
  try {
    const value = JSON.parse(text);
    if (value.schema === STATE_SCHEMA) {
      return { ...emptyState(), ...value, clients: value.clients ?? {} };
    }
  } catch {
  }
  return emptyState();
}
function writeState(ctx, state) {
  ensurePrivateDir(pathApi(ctx.platform).dirname(installStatePath(ctx)));
  atomicWriteText(installStatePath(ctx), `${JSON.stringify(state, null, 2)}
`);
}
function listInstalledVersions(versionsRoot) {
  try {
    return fs7.readdirSync(versionsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

// src/installer/stores.ts
import fs8 from "node:fs";
function fileStore(file) {
  return {
    describe: () => file,
    read: async () => readTextIfExists(file),
    write: async (text) => atomicWriteText(file, text),
    remove: async () => fs8.rmSync(file, { force: true })
  };
}
var TOOL_SERVERS_PATH = "/api/v1/configs/tool_servers";
function openWebUiStore(options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = new URL(TOOL_SERVERS_PATH, options.baseUrl).toString();
  const headers = { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" };
  const call = async (init) => {
    const response = await fetchImpl(url, { ...init, headers, signal: AbortSignal.timeout(1e4) });
    if (!response.ok) {
      throw new Error(`Open WebUI answered ${response.status} for the tool-server configuration (check the URL and that the key is an admin key).`);
    }
    return response.json();
  };
  return {
    describe: () => `${new URL(options.baseUrl).origin}${TOOL_SERVERS_PATH}`,
    read: async () => {
      const body = await call({ method: "GET" });
      return JSON.stringify(Array.isArray(body.TOOL_SERVER_CONNECTIONS) ? body.TOOL_SERVER_CONNECTIONS : [], null, 2);
    },
    write: async (text) => {
      await call({ method: "POST", body: JSON.stringify({ TOOL_SERVER_CONNECTIONS: JSON.parse(text) }) });
    },
    remove: async () => void 0
  };
}

// src/installer/engine.ts
var CLIENT_IDS = ["codex", "claude", "open-webui"];
var InstallFailure = class extends Error {
  problems;
  constructor(message, problems = []) {
    super(message);
    this.problems = problems;
  }
};
function specFor(ctx, manifest, dir, node) {
  const api = pathApi(ctx.platform);
  const command = manifest.runtime === null ? node : api.join(dir, ...manifest.runtime.entry.split("/"));
  if (command === null) {
    throw new InstallFailure("This delivery has no Node.js of its own and none was chosen.");
  }
  return { command, args: [api.join(dir, ...manifest.entry.split("/"))] };
}
function storeFor(client, options) {
  const { ctx } = options;
  if (client === "codex") {
    return fileStore(options.configPaths?.codex ?? codexConfigPath(ctx));
  }
  if (client === "claude") {
    return fileStore(options.configPaths?.claude ?? claudeConfigPath(ctx));
  }
  const { baseUrl, apiKey } = options.openWebUi ?? {};
  return baseUrl && apiKey ? openWebUiStore({ baseUrl, apiKey, fetchImpl: options.openWebUi?.fetchImpl }) : null;
}
function outcomeOf(plan, forced) {
  if (plan.next === null) {
    return plan.cls === "ambiguous" ? "blocked" : "unchanged";
  }
  switch (plan.cls) {
    case "absent":
      return "added";
    case "outdated":
      return "updated";
    case "legacy":
      return "migrated";
    case "ambiguous":
      return forced ? "replaced" : "blocked";
    default:
      return plan.migrated.length > 0 ? "migrated" : "updated";
  }
}
function assertLoopback(url) {
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "[::1]") {
    throw new InstallFailure(`The Open WebUI address ${host} is not on this computer. The admin key is only ever sent to a loopback address.`);
  }
}
async function relayDiagnostics(relayPort) {
  const inspection = await inspectRelay({ host: "127.0.0.1", port: relayPort });
  switch (inspection.state) {
    case "down":
      return { summary: { state: "down", message: `No relay is running on port ${relayPort}; the first agent call starts one.` }, diagnostics: [] };
    case "ready":
    case "token-missing":
      return { summary: { state: inspection.state, message: `A compatible Convyy relay (revision ${inspection.revision}) answers on port ${relayPort}.` }, diagnostics: [] };
    case "incompatible":
    case "foreign":
      return {
        summary: { state: inspection.state, message: inspection.reason },
        diagnostics: [{
          level: "warning",
          code: "relay_port_busy",
          message: `${inspection.reason} The new connector will not use it and the installer will not stop it. Close the program that started it (find it with \`lsof -i :${relayPort}\` on macOS, \`netstat -ano | findstr :${relayPort}\` on Windows), or run the connector with another --port.`
        }]
      };
    default:
      return { summary: { state: "unknown", message: "" }, diagnostics: [] };
  }
}
function stateAfter(state, manifest, dir, applied, untouched, openWebUiPort, now, node) {
  const next = JSON.parse(JSON.stringify(state));
  const key = bundleKey(manifest);
  if (next.current?.version !== key) {
    next.previous = next.current?.version ?? next.previous;
  }
  next.current = { version: key, channel: manifest.channel, platform: manifest.platform, dir, node };
  for (const entry of applied) {
    next.clients[entry.client] = {
      version: key,
      store: entry.store,
      backupId: entry.backup?.id ?? next.clients[entry.client]?.backupId ?? null,
      updatedAt: now.toISOString()
    };
  }
  for (const client of untouched) {
    next.clients[client] = {
      version: key,
      store: next.clients[client]?.store ?? "",
      backupId: next.clients[client]?.backupId ?? null,
      updatedAt: next.clients[client]?.updatedAt ?? now.toISOString()
    };
  }
  if (openWebUiPort !== null) {
    next.openWebUi = { port: openWebUiPort };
  }
  next.updatedAt = now.toISOString();
  return next;
}
function stageVersion(options, manifest, dir) {
  const { ctx } = options;
  const machine = { platform: ctx.platform, arch: ctx.arch };
  if (fs9.existsSync(dir)) {
    try {
      const installed = readBundleManifest(dir);
      verifyBundle(dir, installed, machine);
      if (sha256File(path6.join(dir, MANIFEST_FILE)) === sha256File(path6.join(options.bundleDir, MANIFEST_FILE))) {
        return { created: false, trashed: null };
      }
      if (manifest.channel === "release") {
        throw new InstallFailure(`Version ${bundleKey(manifest)} is already installed with different content. Released versions are immutable; use a newer version.`);
      }
    } catch (error) {
      if (error instanceof InstallFailure) {
        throw error;
      }
    }
  }
  ensurePrivateDir(stagingDir(ctx));
  const staged = path6.join(stagingDir(ctx), `${bundleKey(manifest)}-${randomBytes4(4).toString("hex")}`);
  try {
    copyTree(options.bundleDir, staged);
    verifyBundle(staged, readBundleManifest(staged), machine);
    if (ctx.platform !== "win32" && manifest.runtime !== null) {
      fs9.chmodSync(path6.join(staged, ...manifest.runtime.entry.split("/")), 493);
    }
  } catch (error) {
    removeTree(staged);
    throw error;
  }
  ensurePrivateDir(versionsDir(ctx));
  let trashed = null;
  if (fs9.existsSync(dir)) {
    ensurePrivateDir(trashDir(ctx));
    trashed = path6.join(trashDir(ctx), `${bundleKey(manifest)}-${randomBytes4(4).toString("hex")}`);
    fs9.renameSync(dir, trashed);
  }
  try {
    fs9.renameSync(staged, dir);
  } catch (error) {
    removeTree(staged);
    if (trashed !== null) {
      fs9.renameSync(trashed, dir);
    }
    throw error;
  }
  return { created: true, trashed };
}
function pruneVersions(ctx, state) {
  const keep = /* @__PURE__ */ new Set();
  if (state.current) keep.add(state.current.version);
  if (state.previous) keep.add(state.previous);
  for (const client of Object.values(state.clients)) keep.add(client.version);
  for (const name of listInstalledVersions(versionsDir(ctx))) {
    if (!keep.has(name)) {
      removeTree(path6.join(versionsDir(ctx), name));
    }
  }
  removeTree(trashDir(ctx));
}
async function runInstall(options) {
  const { ctx } = options;
  const now = (options.now ?? (() => /* @__PURE__ */ new Date()))();
  const relayPort = options.relayPort ?? 4318;
  const dryRun = options.dryRun === true;
  const report = {
    ok: false,
    dryRun,
    version: null,
    channel: null,
    command: null,
    args: [],
    layers: { installed: false, configured: {}, toolsVerified: null },
    clients: [],
    relay: { state: "unknown", message: "" },
    diagnostics: [],
    rolledBack: false,
    error: null
  };
  if (options.clients.length === 0) {
    report.error = "No client selected. Name the application to connect: --client codex, claude or open-webui.";
    return report;
  }
  let release = () => void 0;
  try {
    if (!dryRun) {
      ensurePrivateDir(ctx.installRoot);
      release = acquireInstallLock(ctx);
    }
    const manifest = readBundleManifest(options.bundleDir);
    verifyBundle(options.bundleDir, manifest, { platform: ctx.platform, arch: ctx.arch });
    const key = bundleKey(manifest);
    report.version = key;
    report.channel = manifest.channel;
    if (manifest.versions.relayProtocol !== CONVYY_RELAY_PROTOCOL_VERSION) {
      report.diagnostics.push({ level: "warning", code: "protocol_differs", message: `This delivery speaks ${manifest.versions.relayProtocol}; the installer was built for ${CONVYY_RELAY_PROTOCOL_VERSION}.` });
    }
    const dir = versionDir(ctx, key);
    let node = null;
    if (manifest.runtime === null) {
      node = await resolveNode({
        ctx,
        execPath: options.node?.execPath ?? process.execPath,
        pinned: options.node?.pinned,
        allowDownload: !dryRun,
        fetchImpl: options.node?.fetchImpl,
        probeVersion: options.node?.probeVersion,
        log: options.node?.log
      });
      for (const text of node.notes) {
        report.diagnostics.push({ level: "info", code: "node_note", message: text });
      }
      report.diagnostics.push({
        level: "info",
        code: node.pendingDownload ? "node_would_download" : "node_choice",
        message: node.pendingDownload ? `No Node.js ${MIN_NODE_MAJOR} or newer was found. A real run downloads the official Node.js ${node.version} once, checks its SHA-256 and keeps it in ${node.command}.` : `Convyy MCP runs on Node.js ${node.version ?? "?"} (${node.source === "system" ? "found on this computer" : "kept from an earlier install"}): ${node.command}`
      });
    }
    const spec = specFor(ctx, manifest, dir, node?.command ?? null);
    report.command = spec.command;
    report.args = spec.args;
    const state = readState(ctx);
    const probe = options.probe ?? fsProbe;
    const relay = await relayDiagnostics(relayPort);
    report.relay = relay.summary;
    report.diagnostics.push(...relay.diagnostics);
    const planned = [];
    let httpToken = null;
    const httpPort = options.openWebUi?.port ?? state.openWebUi?.port ?? DEFAULT_HTTP_PORT;
    for (const client of options.clients) {
      const store = storeFor(client, options);
      if (client === "open-webui") {
        if (options.openWebUi?.baseUrl) {
          assertLoopback(options.openWebUi.baseUrl);
        }
        httpToken = dryRun ? { token: "<token>", path: "", created: false } : ensureHttpToken(ctx);
        const url = `http://127.0.0.1:${httpPort}/mcp`;
        if (store === null) {
          planned.push({
            client,
            store: null,
            before: null,
            plan: null,
            manual: {
              url,
              tokenFile: httpToken.path,
              steps: [
                "In Open WebUI: Admin Settings -> External Tools -> + (Add connection).",
                `Type: MCP Streamable HTTP. URL: ${url}. Auth: Bearer; paste the token from the token file above.`,
                "ID: convyy, Name: Convyy. Save, then enable Convyy in the Tools menu of a chat with a tool-capable model."
              ]
            }
          });
          continue;
        }
        const before2 = await store.read();
        planned.push({
          client,
          store,
          before: before2,
          plan: planOpenWebUi(before2, { http: { url, token: httpToken.token }, replaceAmbiguous: options.replaceAmbiguous === true }),
          manual: null
        });
        continue;
      }
      const target = store;
      const before = await target.read();
      const input = { ctx, spec, replaceAmbiguous: options.replaceAmbiguous === true, probe };
      planned.push({ client, store: target, before, plan: client === "codex" ? planCodex(before, input) : planClaude(before, input), manual: null });
    }
    const reportFor = (entry, outcome, backupId = null) => {
      const plan = entry.plan;
      return {
        client: entry.client,
        store: entry.store?.describe() ?? "Open WebUI (manual)",
        outcome: outcome ?? (entry.manual ? "manual" : plan ? outcomeOf(plan, options.replaceAmbiguous === true) : "unchanged"),
        cls: plan?.cls ?? null,
        reason: plan?.reason ?? null,
        diagnostics: plan?.diagnostics ?? [],
        backupId,
        migrated: plan?.migrated ?? [],
        ...entry.manual ? { manual: entry.manual } : {}
      };
    };
    if (dryRun) {
      report.clients = planned.map((entry) => reportFor(entry));
      report.ok = report.clients.every((client) => client.outcome !== "blocked");
      return report;
    }
    const staged = stageVersion(options, manifest, dir);
    report.layers.installed = true;
    const undoStage = () => {
      if (staged.created) {
        removeTree(dir);
        if (staged.trashed !== null && fs9.existsSync(staged.trashed)) {
          fs9.renameSync(staged.trashed, dir);
        }
      }
    };
    if (options.skipConnectorCheck !== true) {
      const check = await checkConnector(ctx, spec, manifest.versions.toolContract.tools);
      report.layers.toolsVerified = check.ok;
      if (!check.ok) {
        undoStage();
        report.layers.installed = false;
        throw new InstallFailure(`The installed copy did not pass its start check: ${check.error}`);
      }
    }
    const applied = [];
    const reports = [];
    const rollback = async () => {
      for (const entry of [...applied].reverse()) {
        try {
          const text = readBackupText(entry.backup);
          if (text === null) {
            await entry.store.remove();
          } else {
            await entry.store.write(text);
          }
        } catch (error) {
          report.diagnostics.push({ level: "error", code: "rollback_failed", message: `Could not restore ${entry.store.describe()}: ${error instanceof Error ? error.message : "unknown error"}. The backup is ${entry.backup.file ?? "(the file did not exist)"}.` });
        }
      }
      undoStage();
      report.rolledBack = applied.length > 0 || staged.created;
    };
    try {
      for (const entry of planned) {
        if (entry.store === null || entry.plan === null) {
          reports.push(reportFor(entry));
          continue;
        }
        const plan = entry.plan;
        if (plan.next === null) {
          reports.push(reportFor(entry));
          continue;
        }
        const backup = createBackup(ctx, entry.client, entry.store.describe(), entry.before, now);
        applied.push({ client: entry.client, store: entry.store, backup });
        await entry.store.write(plan.next);
        options.afterClientWrite?.(entry.client);
        const written = await entry.store.read();
        const input = entry.client === "open-webui" ? null : { ctx, spec, replaceAmbiguous: false, probe };
        const verify = entry.client === "open-webui" ? planOpenWebUi(written, { http: { url: `http://127.0.0.1:${httpPort}/mcp`, token: httpToken?.token ?? "" }, replaceAmbiguous: false }) : entry.client === "codex" ? planCodex(written, input) : planClaude(written, input);
        if (verify.cls !== "current" || verify.next !== null) {
          throw new InstallFailure(`${entry.store.describe()} does not read back as the new entry after writing.`);
        }
        reports.push(reportFor(entry, void 0, backup.id));
      }
    } catch (error) {
      await rollback();
      throw error;
    }
    report.clients = reports;
    for (const entry of reports) {
      report.layers.configured[entry.client] = entry.outcome !== "blocked" && entry.outcome !== "manual" && entry.outcome !== "failed";
    }
    const touched = applied.map((entry) => ({ client: entry.client, store: entry.store.describe(), backup: entry.backup }));
    const unchangedClients = reports.filter((entry) => entry.outcome === "unchanged").map((entry) => entry.client);
    const openWebUiSelected = options.clients.includes("open-webui");
    const nextState = stateAfter(state, manifest, dir, touched, unchangedClients, openWebUiSelected ? httpPort : null, now, node?.command ?? null);
    if (JSON.stringify({ ...nextState, updatedAt: null }) !== JSON.stringify({ ...state, updatedAt: null })) {
      writeState(ctx, nextState);
    }
    if (openWebUiSelected && httpToken && options.openWebUi?.start !== false) {
      const daemon = await ensureHttpDaemon({
        ctx,
        runtime: spec.command,
        script: spec.args[0],
        version: key,
        port: httpPort,
        relayPort,
        token: httpToken.token,
        tokenPath: httpToken.path,
        fetchImpl: options.openWebUi?.fetchImpl,
        spawnImpl: options.openWebUi?.spawnImpl
      });
      if (daemon.state === "blocked" || daemon.state === "failed") {
        report.diagnostics.push({ level: "warning", code: `open_webui_endpoint_${daemon.state}`, message: daemon.message ?? "" });
      } else {
        report.diagnostics.push({ level: "info", code: "open_webui_endpoint", message: `The Convyy endpoint for Open WebUI is ${daemon.state} on 127.0.0.1:${httpPort}.` });
      }
    }
    pruneVersions(ctx, nextState);
    report.ok = report.clients.every((entry) => entry.outcome !== "blocked" && entry.outcome !== "failed");
    return report;
  } catch (error) {
    if (error instanceof BundleError) {
      report.error = error.problems.length > 0 ? `${error.message} ${error.problems.slice(0, 5).join("; ")}` : error.message;
    } else if (error instanceof InstallFailure || error instanceof InstallLockedError || error instanceof NodeUnavailableError) {
      report.error = error.message;
    } else {
      report.error = `Install failed: ${error instanceof Error ? error.message : "unknown error"}`;
    }
    report.ok = false;
    return report;
  } finally {
    release();
  }
}
async function runStatus(options) {
  const { ctx } = options;
  const state = readState(ctx);
  const result = {
    installed: false,
    version: state.current?.version ?? null,
    channel: state.current?.channel ?? null,
    bundleProblems: [],
    clients: [],
    toolsVerified: null,
    toolsError: null,
    relay: { state: "unknown", message: "" },
    openWebUiEndpoint: null,
    boardConnected: "check-in-board"
  };
  let spec = null;
  let manifest = null;
  if (state.current) {
    const dir = state.current.dir;
    try {
      manifest = readBundleManifest(dir);
      verifyBundle(dir, manifest, { platform: ctx.platform, arch: ctx.arch });
      const node = state.current.node ?? null;
      if (manifest.runtime === null && (node === null || !fs9.existsSync(node))) {
        throw new Error(`The Node.js this install runs on is gone (${node ?? "unknown"}). Run the installer again to pick a Node.js.`);
      }
      spec = specFor(ctx, manifest, dir, node);
      result.installed = true;
    } catch (error) {
      result.bundleProblems = error instanceof BundleError && error.problems.length > 0 ? error.problems : [error instanceof Error ? error.message : "unreadable"];
    }
  }
  const chosen = options.clients ?? Object.keys(state.clients).filter((id) => CLIENT_IDS.includes(id));
  for (const client of chosen) {
    if (client === "open-webui") {
      continue;
    }
    const store = storeFor(client, { ...options, clients: [], bundleDir: "" });
    if (!store || !spec) {
      result.clients.push({ client, store: store?.describe() ?? "", cls: "absent", configured: false, reason: spec ? null : "Convyy MCP is not installed." });
      continue;
    }
    const text = await store.read();
    const input = { ctx, spec, replaceAmbiguous: false, probe: options.probe ?? fsProbe };
    const plan = client === "codex" ? planCodex(text, input) : planClaude(text, input);
    result.clients.push({ client, store: store.describe(), cls: plan.cls, configured: plan.cls === "current", reason: plan.reason });
  }
  if (chosen.includes("open-webui") && state.openWebUi) {
    result.openWebUiEndpoint = { state: (await probeHttpEndpoint(state.openWebUi.port)).state, port: state.openWebUi.port };
  }
  if (spec && manifest && options.verifyTools !== false) {
    const check = await checkConnector(ctx, spec, manifest.versions.toolContract.tools);
    result.toolsVerified = check.ok;
    result.toolsError = check.error;
  }
  result.relay = (await relayDiagnostics(options.relayPort ?? 4318)).summary;
  return result;
}
async function runRollback(options) {
  const { ctx } = options;
  const dir = backupsDir(ctx);
  const records = [];
  try {
    for (const name of fs9.readdirSync(dir)) {
      if (name.endsWith(".json")) {
        const record2 = JSON.parse(fs9.readFileSync(path6.join(dir, name), "utf8"));
        if (record2.client === options.client && (options.backupId === void 0 || record2.id === options.backupId)) {
          records.push(record2);
        }
      }
    }
  } catch {
  }
  records.sort((a, b) => a.id.localeCompare(b.id));
  const record = records[records.length - 1];
  if (!record) {
    return { ok: false, restored: [], error: `No backup of the ${options.client} configuration was found.` };
  }
  if (options.client === "open-webui") {
    return { ok: false, restored: [], error: "Open WebUI connections are restored from its own Admin Settings; the backup file is " + (record.file ?? "(none)") + "." };
  }
  const store = storeFor(options.client, { ...options, clients: [], bundleDir: "" });
  try {
    const text = readBackupText(record);
    if (text === null) {
      await store.remove();
    } else {
      await store.write(text);
    }
  } catch (error) {
    return { ok: false, restored: [], error: error instanceof Error ? error.message : "restore failed" };
  }
  const state = readState(ctx);
  delete state.clients[options.client];
  writeState(ctx, state);
  return { ok: true, restored: [{ client: options.client, store: store.describe(), backupId: record.id }], error: null };
}

// src/installer/cli.ts
var USAGE = `Convyy MCP installer

Usage (from the channel repository; an archive release uses runtime/node instead of node):
  node app/installer.js install --client <codex|claude|open-webui>[,...] [options]
  node app/installer.js repair  [--client ...] [options]   re-apply the installed version (default: the clients set up before)
  node app/installer.js status  [--client ...] [--no-tools-check]
  node app/installer.js rollback --client <codex|claude> [--backup <id>]

Convyy MCP runs on the Node.js already installed on this computer (version ${MIN_NODE_MAJOR} or newer). Only if there is none,
the installer downloads the official Node.js once (SHA-256 checked) and keeps it for later installs.

Options:
  --client <list>           the application(s) to connect; nothing is changed for an application you do not name
  --dry-run                 show what would change; write nothing
  --json                    machine-readable report
  --replace-ambiguous       replace a \`convyy\` entry the installer does not recognise (it is backed up first)
  --bundle <dir>            the extracted archive (default: the one this script belongs to)
  --relay-port <n>          relay port to diagnose (default 4318)
  --codex-config <path>     Codex config.toml (default: $CODEX_HOME or ~/.codex)
  --claude-config <path>    Claude Code .claude.json (default: ~/.claude.json)
  --open-webui-url <url>    loopback address of Open WebUI, to add the connection through its admin API
  --open-webui-key-env <N>  name of the environment variable holding an Open WebUI admin API key (default OPEN_WEBUI_API_KEY)
  --open-webui-port <n>     port of the Convyy endpoint for Open WebUI (default 4319)
  --no-start                do not start the Open WebUI endpoint
  --home <dir>              treat this directory as the user's home (tests, sandboxes)

Exit code: 0 done, 1 failed (nothing left half-changed), 2 wrong usage, 3 needs a decision (see "blocked").
`;
var VALUE_FLAGS = /* @__PURE__ */ new Set([
  "client",
  "bundle",
  "relay-port",
  "codex-config",
  "claude-config",
  "open-webui-url",
  "open-webui-key-env",
  "open-webui-port",
  "home",
  "backup"
]);
var BOOLEAN_FLAGS = /* @__PURE__ */ new Set(["dry-run", "json", "replace-ambiguous", "no-start", "no-tools-check", "help"]);
function parseArgs(argv) {
  const [command = "", ...rest] = argv;
  const flags = /* @__PURE__ */ new Map();
  for (let index = 0; index < rest.length; index += 1) {
    const raw = rest[index];
    if (!raw.startsWith("--")) {
      return `Unexpected argument: ${raw}`;
    }
    const name = raw.slice(2);
    if (BOOLEAN_FLAGS.has(name)) {
      flags.set(name, true);
    } else if (VALUE_FLAGS.has(name)) {
      const value = rest[index + 1];
      if (value === void 0 || value.startsWith("--")) {
        return `--${name} needs a value.`;
      }
      flags.set(name, value);
      index += 1;
    } else {
      return `Unknown option: ${raw}`;
    }
  }
  return { command, flags };
}
function parseClients(value) {
  if (typeof value !== "string") {
    return [];
  }
  const ids = value.split(",").map((part) => part.trim()).filter(Boolean);
  const unknown = ids.find((id) => !CLIENT_IDS.includes(id));
  return unknown ? `Unknown client "${unknown}". Choose from: ${CLIENT_IDS.join(", ")}.` : [...new Set(ids)];
}
function renderInstall(report) {
  const lines = [];
  if (report.error) {
    lines.push(`FAILED: ${report.error}`);
    if (report.rolledBack) {
      lines.push("Everything this run changed was put back.");
    }
  } else {
    lines.push(`${report.dryRun ? "Would install" : "Installed"} Convyy MCP ${report.version} (${report.channel}).`);
    if (report.command) {
      lines.push(`  node: ${report.command}`);
    }
  }
  for (const client of report.clients) {
    lines.push(`- ${client.client}: ${client.outcome}${client.cls ? ` (${client.cls})` : ""}  ${client.store}`);
    if (client.reason) lines.push(`    ${client.reason}`);
    if (client.backupId) lines.push(`    backup: ${client.backupId}`);
    for (const place of client.migrated) lines.push(`    migrated project entry: ${place}`);
    for (const diagnostic of client.diagnostics) lines.push(`    ${diagnostic.level}: ${diagnostic.message}`);
    if (client.manual) {
      lines.push(`    URL: ${client.manual.url}`);
      lines.push(`    token file: ${client.manual.tokenFile}`);
      for (const step of client.manual.steps) lines.push(`    ${step}`);
    }
  }
  for (const diagnostic of report.diagnostics) {
    lines.push(`${diagnostic.level}: ${diagnostic.message}`);
  }
  if (!report.error && !report.dryRun) {
    lines.push("Installed: yes. Restart the application, then ask the agent to list the Convyy tools.");
    lines.push("Turn MCP on in the board to connect it (it is off after every page load).");
  }
  return `${lines.join("\n")}
`;
}
function renderStatus(status) {
  const lines = [
    `installed:        ${status.installed ? `yes (${status.version}, ${status.channel})` : "no"}`,
    ...status.bundleProblems.map((problem) => `  problem: ${problem}`),
    ...status.clients.map((client) => `configured ${client.client}: ${client.configured ? "yes" : `no (${client.cls})`}${client.reason ? ` - ${client.reason}` : ""}`),
    `tools verified:   ${status.toolsVerified === null ? "not checked" : status.toolsVerified ? "yes (5 tools listed by the installed connector)" : `no - ${status.toolsError}`}`,
    `relay:            ${status.relay.state}  ${status.relay.message}`,
    "board connected:  open the board and switch MCP on; the board shows it"
  ];
  if (status.openWebUiEndpoint) {
    lines.push(`open webui endpoint: ${status.openWebUiEndpoint.state} (port ${status.openWebUiEndpoint.port})`);
  }
  return `${lines.join("\n")}
`;
}
async function runInstallerCli(argv, io) {
  const parsed = parseArgs(argv);
  if (typeof parsed === "string") {
    io.err(`${parsed}

${USAGE}`);
    return 2;
  }
  const { command, flags } = parsed;
  if (command === "" || command === "help" || flags.has("help")) {
    io.out(USAGE);
    return command === "" ? 2 : 0;
  }
  if (!["install", "update", "repair", "status", "rollback"].includes(command)) {
    io.err(`Unknown command: ${command}

${USAGE}`);
    return 2;
  }
  const env = io.env ?? process.env;
  const home = flags.get("home");
  const ctx = createInstallContext({
    env,
    ...typeof home === "string" ? { homeDir: path7.resolve(home) } : {}
  });
  const json = flags.has("json");
  const configPaths = {
    codex: typeof flags.get("codex-config") === "string" ? path7.resolve(flags.get("codex-config")) : void 0,
    claude: typeof flags.get("claude-config") === "string" ? path7.resolve(flags.get("claude-config")) : void 0
  };
  const relayPortFlag = flags.get("relay-port");
  const relayPort = typeof relayPortFlag === "string" ? Number.parseInt(relayPortFlag, 10) : void 0;
  if (relayPort !== void 0 && !(relayPort > 0 && relayPort < 65536)) {
    io.err("--relay-port must be a port number.\n");
    return 2;
  }
  let clients = parseClients(flags.get("client"));
  if (typeof clients === "string") {
    io.err(`${clients}
`);
    return 2;
  }
  if (clients.length === 0 && (command === "repair" || command === "status")) {
    const state = readState(ctx);
    clients = Object.keys(state.clients).filter((id) => CLIENT_IDS.includes(id));
    if (state.openWebUi && !clients.includes("open-webui")) {
      clients.push("open-webui");
    }
  }
  if (command === "status") {
    const status = await runStatus({ ctx, clients, configPaths, relayPort, verifyTools: !flags.has("no-tools-check") });
    io.out(json ? `${JSON.stringify(status, null, 2)}
` : renderStatus(status));
    return status.installed ? 0 : 1;
  }
  if (command === "rollback") {
    if (clients.length !== 1) {
      io.err("rollback needs exactly one --client.\n");
      return 2;
    }
    const backup = flags.get("backup");
    const result = await runRollback({ ctx, configPaths, client: clients[0], backupId: typeof backup === "string" ? backup : void 0 });
    io.out(json ? `${JSON.stringify(result, null, 2)}
` : result.ok ? `Restored ${result.restored[0].store} from backup ${result.restored[0].backupId}.
` : `FAILED: ${result.error}
`);
    return result.ok ? 0 : 1;
  }
  const bundleFlag = flags.get("bundle");
  const here = path7.dirname(fileURLToPath(import.meta.url));
  const bundleDir = typeof bundleFlag === "string" ? path7.resolve(bundleFlag) : fs10.existsSync(path7.join(here, MANIFEST_FILE)) ? here : path7.dirname(here);
  const urlFlag = flags.get("open-webui-url");
  const keyEnvFlag = flags.get("open-webui-key-env");
  const apiKey = typeof urlFlag === "string" ? env[typeof keyEnvFlag === "string" ? keyEnvFlag : "OPEN_WEBUI_API_KEY"] : void 0;
  if (typeof urlFlag === "string" && !apiKey) {
    io.err("--open-webui-url needs the admin API key in the environment (OPEN_WEBUI_API_KEY, or the variable named by --open-webui-key-env). Keys are never read from arguments.\n");
    return 2;
  }
  const portFlag = flags.get("open-webui-port");
  const report = await runInstall({
    ctx,
    bundleDir,
    clients,
    dryRun: flags.has("dry-run"),
    replaceAmbiguous: flags.has("replace-ambiguous"),
    configPaths,
    relayPort,
    node: json ? void 0 : { log: (text) => io.err(`${text}
`) },
    openWebUi: {
      baseUrl: typeof urlFlag === "string" ? urlFlag : void 0,
      apiKey,
      port: typeof portFlag === "string" ? Number.parseInt(portFlag, 10) : void 0,
      start: !flags.has("no-start")
    }
  });
  io.out(json ? `${JSON.stringify(report, null, 2)}
` : renderInstall(report));
  if (report.error) {
    return clients.length === 0 ? 2 : 1;
  }
  return report.clients.some((client) => client.outcome === "blocked") ? 3 : 0;
}

// src/installer.ts
var proc = process;
var code = await runInstallerCli(proc.argv.slice(2), {
  out: (text) => void proc.stdout.write(text),
  err: (text) => void proc.stderr.write(text)
});
proc.exit(code);
