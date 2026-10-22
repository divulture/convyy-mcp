#!/usr/bin/env node

// src/server.ts
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// src/server/mcpProtocol.ts
function createJsonRpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function createJsonRpcError(id, code, message, data) {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, data }
  };
}

// src/server/stdioTransport.ts
var encoder = new TextEncoder();
var decoder = new TextDecoder();
var nodeProcess = globalThis;
function writeFramedJsonRpcMessage(response) {
  nodeProcess.process?.stdout.write(encoder.encode(`${JSON.stringify(response)}
`));
}
var ID_AT_START = /"id"\s*:\s*(-?\d+|"(?:[^"\\]|\\.){0,64}")/;
function readIdAtStart(text) {
  const match = ID_AT_START.exec(text.slice(0, 1024));
  if (!match) {
    return null;
  }
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}
function createStdioMessageReader(onMessage, options = {}) {
  const max = options.maxMessageBytes ?? Number.POSITIVE_INFINITY;
  let buffer = "";
  let discarding = false;
  const reportOversize = (head, bytes) => {
    options.onOversize?.({ id: readIdAtStart(head), bytes });
  };
  nodeProcess.process?.stdin.on("data", (chunk) => {
    let text = decoder.decode(chunk, { stream: true });
    while (text.length > 0) {
      const newlineIndex = text.indexOf("\n");
      const piece = newlineIndex === -1 ? text : text.slice(0, newlineIndex);
      text = newlineIndex === -1 ? "" : text.slice(newlineIndex + 1);
      if (discarding) {
        if (newlineIndex !== -1) {
          discarding = false;
        }
        continue;
      }
      buffer += piece;
      if (buffer.length > max) {
        reportOversize(buffer, buffer.length);
        buffer = "";
        discarding = newlineIndex === -1;
        continue;
      }
      if (newlineIndex === -1) {
        continue;
      }
      const line = buffer.trim();
      const head = buffer;
      buffer = "";
      if (line.length === 0) {
        continue;
      }
      if (line.length * 3 > max) {
        const bytes = encoder.encode(line).byteLength;
        if (bytes > max) {
          reportOversize(head, bytes);
          continue;
        }
      }
      try {
        onMessage(JSON.parse(line));
      } catch {
      }
    }
  });
}

// src/generated/toolCatalog.json
var toolCatalog_default = {
  generatedBy: "features/ai/mcp/toolDefinitions.ts via scripts/mcp/generateCatalog.mjs - do not edit by hand",
  schemaVersion: 1,
  tools: [
    {
      name: "convyy_draw",
      title: "Draw On Board",
      description: "Render any board content you compose from native primitives. Provide `elements` (shape, sticky, frame, text, image, connector); the server owns ids and styling, but YOU own the layout \u2014 give explicit x/y/width/height so nothing overlaps. LAYOUT RULES: (1) Stickies are ALWAYS square; the side equals the `width` you send (height is ignored), so reserve a square footprint and leave >=40px gaps between boxes. (2) Lay diagrams out on a clean grid (left-to-right or top-to-bottom) and connect adjacent boxes; do NOT place any shape on the straight line between two boxes you connect, or the arrow will cross it. (3) For a branch/decision, offset the branch target to the side or below with clear space so its connector has an empty corridor \u2014 the server routes arrows from the nearest edges with elbow bends, which only stays clean when you leave room. Use this for anything that does not fit a named template. THINKING SIGNAL: when you START handling the user's request, call this once with empty `elements: []` so the board shows your cursor 'thinking'; then call it again with the real `elements` once you have composed the answer.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Short description of what to draw. Required, non-blank (also for the empty thinking call)."
          },
          layout: {
            type: "string",
            enum: [
              "free",
              "flow-lr",
              "grid"
            ],
            description: "Layout hint: free | flow-lr | grid. Default free."
          },
          elements: {
            type: "array",
            description: "Elements you generate from the request. Each is one of: { kind:'shape', id, text, shapeType, x?,y?,width?,height?, fill? } \u2014 shapeType is one of: rectangle | rounded-rectangle | ellipse | diamond | parallelogram | star | triangle | hexagon | process | decision | terminator | data | document | database | manual-operation | preparation | internal-storage | predefined-process | stored-data | display | delay | merge | off-page-connector | direct-access-storage | comment | note | circle-plus | circle-x (default process); fill is one of: transparent | white | amber | orange | green | sky | violet | fuchsia. | { kind:'sticky', id, text, color?, x?,y?,width? } \u2014 color is one of: amber | orange | green | sky | violet | fuchsia (default amber). Use these tokens, NOT plain color names like yellow/blue/green/red. | { kind:'frame', id, title, x?,y?,width?,height? } | { kind:'text', id, text, x?,y?,width?,height?, fontSize?, bold? } | { kind:'image', id, x?,y?,width?,height? } \u2014 place a picture. Provide exactly one source: `data` (base64 or data URL, PNG/JPEG/WebP), `dataChunks` (base64 split into strings), `url` (`imageUrl`, `src`, `path`, `filePath`, `localPath` are aliases) or `assetId` (an existing asset, e.g. from convyy_analyze). Give width/height matching the image aspect ratio, or omit BOTH to auto-size from the decoded image. | { kind:'connector', from, to, label? }. Omit coordinates to let the server lay them out.",
            items: {
              type: "object",
              description: "One board element. Fields that do not apply to the element kind are ignored.",
              properties: {
                kind: {
                  type: "string",
                  enum: [
                    "shape",
                    "sticky",
                    "frame",
                    "text",
                    "image",
                    "connector"
                  ],
                  description: "Element kind. Inferred from the other fields when omitted."
                },
                id: {
                  type: "string",
                  description: "Stable id; connectors reference it. Generated when omitted."
                },
                text: {
                  type: "string",
                  description: "Text of a sticky, shape or text element (also a connector endpoint key)."
                },
                title: {
                  type: "string",
                  description: "Title of a frame."
                },
                x: {
                  type: "number",
                  description: "Left edge in board units. Omit to let the server lay the element out."
                },
                y: {
                  type: "number",
                  description: "Top edge in board units. Omit to let the server lay the element out."
                },
                width: {
                  type: "number",
                  description: "Width. For stickies this is the side of the square."
                },
                height: {
                  type: "number",
                  description: "Height. Ignored for stickies (always square)."
                },
                color: {
                  type: "string",
                  enum: [
                    "amber",
                    "orange",
                    "green",
                    "sky",
                    "violet",
                    "fuchsia"
                  ],
                  description: "Sticky color token. Unknown values fall back to amber."
                },
                shapeType: {
                  type: "string",
                  enum: [
                    "rectangle",
                    "rounded-rectangle",
                    "ellipse",
                    "diamond",
                    "parallelogram",
                    "star",
                    "triangle",
                    "hexagon",
                    "process",
                    "decision",
                    "terminator",
                    "data",
                    "document",
                    "database",
                    "manual-operation",
                    "preparation",
                    "internal-storage",
                    "predefined-process",
                    "stored-data",
                    "display",
                    "delay",
                    "merge",
                    "off-page-connector",
                    "direct-access-storage",
                    "comment",
                    "note",
                    "circle-plus",
                    "circle-x"
                  ],
                  description: "Shape type. Unknown values fall back to process."
                },
                fill: {
                  type: "string",
                  enum: [
                    "transparent",
                    "white",
                    "amber",
                    "orange",
                    "green",
                    "sky",
                    "violet",
                    "fuchsia"
                  ],
                  description: "Shape fill token. Unknown values leave the default fill."
                },
                fontSize: {
                  type: "number",
                  description: "Font size of a text element."
                },
                bold: {
                  type: "boolean",
                  description: "Bold text element."
                },
                data: {
                  type: "string",
                  description: "Image source: base64 or a data URL (PNG/JPEG/WebP)."
                },
                dataChunks: {
                  type: "array",
                  items: {
                    type: "string"
                  },
                  description: "Image source: base64 split into chunks, joined in order."
                },
                assetId: {
                  type: "string",
                  description: "Image source: an existing board asset id, e.g. from convyy_analyze."
                },
                mimeType: {
                  type: "string",
                  enum: [
                    "image/png",
                    "image/jpeg",
                    "image/webp"
                  ],
                  description: "Image MIME type when `data` is raw base64."
                },
                url: {
                  type: "string",
                  description: "Image source: an http(s) URL (or a local file path where supported)."
                },
                imageUrl: {
                  type: "string",
                  description: "Alias of `url`."
                },
                src: {
                  type: "string",
                  description: "Alias of `url`."
                },
                path: {
                  type: "string",
                  description: "Alias of `url` for a local file path."
                },
                filePath: {
                  type: "string",
                  description: "Alias of `url` for a local file path."
                },
                localPath: {
                  type: "string",
                  description: "Alias of `url` for a local file path or file:// URL."
                },
                from: {
                  description: "Connector start: element id, 1-based element index or element text."
                },
                to: {
                  description: "Connector end: element id, 1-based element index or element text."
                },
                label: {
                  type: "string",
                  description: "Connector label."
                }
              },
              additionalProperties: true
            }
          },
          locale: {
            type: "string",
            enum: [
              "ru",
              "en"
            ],
            description: "Language for server-generated names (e.g. a new page). Default en."
          },
          pageId: {
            type: "string",
            description: "Page to draw on. Honored at the start of a request only; later calls of the same request stay on the pinned page."
          },
          boardId: {
            type: "string",
            description: "Board runtime id. Optional: the single open board is used when omitted."
          },
          boardHandle: {
            type: "string",
            description: "Opaque board handle. Optional. When several boards are open the call is not executed and the answer lists the handles to choose from; repeat the call with one of them."
          },
          sessionId: {
            type: "string",
            description: "Optional name of a sub-session inside this connection. It never grants access to another connection's session or batches."
          }
        },
        required: [
          "prompt"
        ],
        additionalProperties: false
      }
    },
    {
      name: "convyy_apply_template",
      title: "Apply Template",
      description: "Apply either an adaptive preset (cjm, swot, raci, retro, bmc, kanban) or a ready-made board template from the gallery catalog. For adaptive presets, you provide structure and the server owns the layout. For board templates, the template acts as a seed layout and Convyy can expand/supplement it from structure/overrides. Call with { list: true } to see both catalogs.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Short description (used for kanban frame title and fallback). Required, non-blank, also with list: true."
          },
          list: {
            type: "boolean",
            description: "Return the available templates instead of rendering."
          },
          templateId: {
            type: "string",
            enum: [
              "cjm",
              "swot",
              "raci",
              "retro",
              "bmc",
              "kanban",
              "swot-analysis",
              "smart-goals",
              "business-model-canvas",
              "customer-journey-map",
              "brainstorming",
              "six-thinking-hats",
              "stakeholder-map",
              "gap-map",
              "dot-voting",
              "checklist",
              "calendar",
              "gantt-chart",
              "venn-diagram",
              "ishikawa-diagram"
            ],
            description: "Adaptive preset: cjm | swot | raci | retro | bmc | kanban. Board template: swot-analysis | smart-goals | business-model-canvas | customer-journey-map | brainstorming | six-thinking-hats | stakeholder-map | gap-map | dot-voting | checklist | calendar | gantt-chart | venn-diagram | ishikawa-diagram. Omit to infer a template from the prompt."
          },
          structure: {
            type: "object",
            description: "Grid templates: { title?, lanes:[{id,label,color?}], stages:[{id,title,cells:{laneId:text}}] }. Kanban: { columns:[{id,title,order}], cards:[{id,title,columnId,status,order}] }. Board templates: sections/items to expand the seed layout.",
            additionalProperties: true
          },
          overrides: {
            type: "object",
            description: "Optional: { addLane:[{id,label}], addColumn:[{id,title}] } to extend the grid on the fly.",
            additionalProperties: true
          },
          locale: {
            type: "string",
            enum: [
              "ru",
              "en"
            ],
            description: "Language for server-generated names. Default en."
          },
          pageId: {
            type: "string",
            description: "Page to apply the template on. Honored at the start of a request only."
          },
          boardId: {
            type: "string",
            description: "Board runtime id. Optional: the single open board is used when omitted."
          },
          boardHandle: {
            type: "string",
            description: "Opaque board handle. Optional. When several boards are open the call is not executed and the answer lists the handles to choose from; repeat the call with one of them."
          },
          sessionId: {
            type: "string",
            description: "Optional name of a sub-session inside this connection. It never grants access to another connection's session or batches."
          }
        },
        required: [
          "prompt"
        ],
        additionalProperties: false
      }
    },
    {
      name: "convyy_pages",
      title: "Pages",
      description: "Manage board pages: list available pages, create a new one, or switch the active page. Returns pages, the active page id and the current session binding.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: [
              "list",
              "create",
              "switch"
            ],
            description: "list (default) | create | switch."
          },
          name: {
            type: "string",
            description: "Page name for action 'create'."
          },
          pageId: {
            type: "string",
            description: "Target page id for action 'switch'."
          },
          boardId: {
            type: "string",
            description: "Board runtime id. Optional: the single open board is used when omitted."
          },
          boardHandle: {
            type: "string",
            description: "Opaque board handle. Optional. When several boards are open the call is not executed and the answer lists the handles to choose from; repeat the call with one of them."
          },
          sessionId: {
            type: "string",
            description: "Optional name of a sub-session inside this connection. It never grants access to another connection's session or batches."
          }
        },
        additionalProperties: false
      }
    },
    {
      name: "convyy_analyze",
      title: "Analyze Canvas",
      description: "Read the canvas and return raw context for synthesis, not a final answer. Do not echo the inventory back to the user. Produce a conclusion that fits the user's request and the content: common theme, clusters or relationships, key insights, contradictions or gaps, and a recommendation or next steps. If the request does not specify the analysis format, default to: theme (1-2 sentences), 3-5 insights, and one recommendation. WHAT is read (`target`): selection (the current selection; a selected frame brings the objects it owns), page (one page: `pageId`, else the current one), pages (the pages in `pageIds`), board (every page). Without a target the current selection is read, or the page when nothing is selected; an explicit selection with nothing selected answers `empty_selection`. HOW it comes back (`representation`): structure (text only), snapshot (structure plus a rendered picture), images (structure plus the source images), full (all three). Reading never changes the open page or where your next draw lands. The older `scope` (page | selection | image) still works but cannot be combined with target/representation/pageIds. Long boards come in parts: the answer carries `completeness` (what is missing and why) and, when more remains, a `cursor` to pass back alone (optionally with `maxObjects`); if the board changed meanwhile the call fails with `stale_context` and must be repeated without the cursor. Texts and table cells are shortened in the overview (`textTruncated`); pass `objectIds` to read those objects in full. Respond in the user's language. Read-only: never modifies the board.",
      inputSchema: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: [
              "image",
              "page",
              "selection"
            ],
            description: "Legacy: page | selection | image. Omit to read the current selection, or the page when nothing is selected."
          },
          pageId: {
            type: "string",
            description: "Page to read. Optional: defaults to the request page, then the open page."
          },
          target: {
            type: "string",
            enum: [
              "selection",
              "page",
              "pages",
              "board"
            ],
            description: "What to read: selection | page | pages | board."
          },
          pageIds: {
            type: "array",
            items: {
              type: "string"
            },
            maxItems: 100,
            description: 'Pages to read with target "pages".'
          },
          representation: {
            type: "string",
            enum: [
              "structure",
              "snapshot",
              "images",
              "full"
            ],
            description: "structure | snapshot | images | full. Defaults: selection full, page snapshot, pages/board structure."
          },
          objectIds: {
            type: "array",
            items: {
              type: "string"
            },
            maxItems: 200,
            description: "Read these objects of the target in full (whole text, every table cell, kanban cards)."
          },
          cursor: {
            type: "string",
            maxLength: 200,
            description: "Continue an earlier read with the cursor it returned. Use it alone (plus maxObjects)."
          },
          maxObjects: {
            type: "integer",
            minimum: 1,
            maximum: 2e3,
            description: "Objects per answer (default 1000); the rest is reachable through the cursor."
          },
          boardId: {
            type: "string",
            description: "Board runtime id. Optional: the single open board is used when omitted."
          },
          boardHandle: {
            type: "string",
            description: "Opaque board handle. Optional. When several boards are open the call is not executed and the answer lists the handles to choose from; repeat the call with one of them."
          },
          sessionId: {
            type: "string",
            description: "Optional name of a sub-session inside this connection. It never grants access to another connection's session or batches."
          }
        },
        additionalProperties: false
      }
    },
    {
      name: "convyy_revert",
      title: "Revert Last Batch",
      description: "Revert the last AI batch of the active runtime session.",
      inputSchema: {
        type: "object",
        properties: {
          boardId: {
            type: "string",
            description: "Board runtime id. Optional: the single open board is used when omitted."
          },
          boardHandle: {
            type: "string",
            description: "Opaque board handle. Optional. When several boards are open the call is not executed and the answer lists the handles to choose from; repeat the call with one of them."
          },
          sessionId: {
            type: "string",
            description: "Optional name of a sub-session inside this connection. It never grants access to another connection's session or batches."
          }
        },
        additionalProperties: false
      }
    }
  ]
};

// src/server/toolCatalog.ts
var TOOL_CATALOG = toolCatalog_default;
function buildMcpToolsList() {
  return TOOL_CATALOG.tools;
}

// src/dev/relayBootstrap.ts
import { spawn } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// src/dev/relayProtocol.ts
import os from "node:os";
import path from "node:path";
var CONVYY_RELAY_PROTOCOL_VERSION = "convyy-dev-relay.v1";
var CONVYY_RELAY_AGENT_TOKEN_HEADER = "x-convyy-relay-agent-token";
var CONVYY_RELAY_CONNECTION_ID_HEADER = "x-convyy-relay-connection-id";
var CONVYY_RELAY_OPERATION_ID_HEADER = "x-convyy-relay-operation-id";
var CONVYY_RELAY_ATTEMPT_HEADER = "x-convyy-relay-attempt";
var CONVYY_RELAY_ROUTING_ERROR = -32004;
var RELAY_ROUTING_CODES = {
  BOARD_TARGET_REQUIRED: "board_target_required",
  BOARD_NOT_FOUND: "board_not_found",
  BOARD_OFF: "board_off",
  EXECUTOR_LOST: "executor_lost",
  UNKNOWN_CONNECTION: "unknown_connection",
  /** The relay is at capacity (in-flight count, per agent, per board or bytes). Nothing was executed; retry later. */
  BUSY: "relay_busy",
  /** One request is larger than the relay accepts. Nothing was executed. */
  LIMIT_EXCEEDED: "limit_exceeded",
  /** Nobody picked the request up before its deadline. Nothing was executed. */
  TIMEOUT: "timeout",
  /** The board had the request but did not answer in time / went away. It may or may not have been applied. */
  OUTCOME_UNKNOWN: "outcome_unknown",
  /** The board stopped the operation before it changed anything (deadline, lost lease, switched off). */
  OPERATION_CANCELLED: "operation_cancelled",
  /** The relay is shutting down for an update; repeat the call in a moment. Nothing was executed. */
  DRAINING: "relay_draining",
  /** The connector could not reach the relay at all. Nothing was sent. */
  UNAVAILABLE: "relay_unavailable"
};
var CONVYY_RELAY_ALLOWED_HOSTS = ["127.0.0.1", "localhost"];
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
var CONVYY_HTTP_DEFAULT_PORT = 4319;
function getHttpEndpointTokenPath() {
  return path.join(resolveMcpStateDir(), "http-bearer.token");
}
function isAllowedRelayHost(hostHeader) {
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
var CONVYY_RELAY_REVISION = 2;
var CONVYY_RELAY_VERSION = "0.1.0";
var CONVYY_RELAY_MIN_COMPATIBLE_REVISION = 2;
var CONVYY_RELAY_DEFAULT_IDLE_EXIT_MS = 10 * 60 * 1e3;
var CONVYY_RELAY_HEARTBEAT_INTERVAL_MS = 60 * 1e3;

// src/dev/relayBootstrap.ts
var RELAY_READY_POLL_INTERVAL_MS = 100;
var RELAY_READY_TIMEOUT_MS = 5e3;
var HEALTH_TIMEOUT_MS = 1500;
var TOKEN_LOST_GRACE_MS = 3e3;
var DRAIN_WAIT_MS = 4e4;
var RelayBootstrapError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "RelayBootstrapError";
    this.code = code;
  }
};
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
function resolveDefaultRelayCliPath() {
  const bundledCliPath = fileURLToPath(new URL("./dev/devRelayCli.js", import.meta.url));
  if (fs.existsSync(bundledCliPath)) {
    return bundledCliPath;
  }
  return fileURLToPath(new URL("./devRelayCli.js", import.meta.url));
}
async function defaultRequestDrain(host, port) {
  try {
    const token = fs.readFileSync(getRelayAgentTokenPath(port), "utf8").trim();
    const response = await fetch(`http://${host}:${port}/admin/drain`, {
      method: "POST",
      headers: { [CONVYY_RELAY_AGENT_TOKEN_HEADER]: token },
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS)
    });
    return response.ok;
  } catch {
    return false;
  }
}
async function ensureRelayProcess(options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const fileExists = options.fileExists ?? fs.existsSync;
  const spawnImpl = options.spawnImpl ?? spawn;
  const waitMs = options.waitMs ?? ((ms) => new Promise((resolve2) => setTimeout(resolve2, ms)));
  const startupTimeoutMs = options.startupTimeoutMs ?? RELAY_READY_TIMEOUT_MS;
  const log = options.log ?? (() => void 0);
  const requestDrain = options.requestDrain ?? defaultRequestDrain;
  const inspect = () => inspectRelay({
    host: options.host,
    port: options.port,
    fetchImpl,
    fileExists,
    minCompatibleRevision: options.minCompatibleRevision
  });
  const relayCliPath = options.relayCliModuleUrl ? fileURLToPath(options.relayCliModuleUrl) : resolveDefaultRelayCliPath();
  let spawned = false;
  const startRelay = () => {
    spawned = true;
    const child = spawnImpl(
      options.nodeExecPath,
      [
        relayCliPath,
        "--host",
        options.host,
        "--port",
        String(options.port),
        "--timeout",
        String(options.requestTimeoutMs),
        ...options.relayArgs ?? []
      ],
      {
        detached: true,
        stdio: "ignore"
      }
    );
    child.unref();
  };
  let deadline = Date.now() + startupTimeoutMs;
  let drainRequested = false;
  let tokenLostSince = null;
  let lastState = "down";
  for (; ; ) {
    const inspection = await inspect();
    lastState = inspection.state;
    if (inspection.state === "incompatible" || inspection.state === "foreign") {
      throw new RelayBootstrapError(
        "incompatible_version",
        `Convyy relay cannot start on http://${options.host}:${options.port}: ${inspection.reason} It is not stopped or reused; free the port or pass another --port.`
      );
    }
    if (inspection.state === "ready") {
      tokenLostSince = null;
      if (!inspection.draining) {
        if (inspection.revision >= CONVYY_RELAY_REVISION) {
          return;
        }
        if (!inspection.capabilities.includes("drain") || drainRequested) {
          log(
            `Using an older Convyy relay (revision ${inspection.revision}) that cannot be replaced safely: it exits only when stopped by hand.`
          );
          return;
        }
        drainRequested = true;
        log(`Replacing Convyy relay revision ${inspection.revision} with revision ${CONVYY_RELAY_REVISION}.`);
        await requestDrain(options.host, options.port);
        deadline = Date.now() + DRAIN_WAIT_MS;
      }
    } else if (inspection.state === "token-missing") {
      tokenLostSince ??= Date.now();
      if (inspection.tokenWatchMs === 0) {
        throw new RelayBootstrapError(
          "incompatible_version",
          `The Convyy relay on port ${options.port}${inspection.pid ? ` (pid ${inspection.pid})` : ""} lost its token file and cannot exit by itself (it is an old version). It is not stopped automatically: stop that process, then try again.`
        );
      }
      const grace = inspection.tokenWatchMs + TOKEN_LOST_GRACE_MS;
      if (Date.now() - tokenLostSince > grace) {
        throw new RelayBootstrapError(
          "relay_unavailable",
          `The Convyy relay on port ${options.port} lost its token file and did not exit within ${grace}ms. It is not stopped automatically.`
        );
      }
      deadline = Math.max(deadline, tokenLostSince + grace + RELAY_READY_TIMEOUT_MS);
    } else if (!spawned) {
      startRelay();
      deadline = Date.now() + startupTimeoutMs;
    }
    if (Date.now() > deadline) {
      break;
    }
    await waitMs(RELAY_READY_POLL_INTERVAL_MS);
  }
  throw new RelayBootstrapError(
    "relay_unavailable",
    `Convyy relay did not become ready on http://${options.host}:${options.port} within ${startupTimeoutMs}ms (last state: ${lastState}).`
  );
}

// src/dev/devRelayServer.ts
import { randomUUID } from "node:crypto";
import fs2 from "node:fs";

// src/dev/relayOperations.ts
var DEFAULT_OPERATION_TTL_MS = 10 * 60 * 1e3;
var DEFAULT_MAX_CACHED_ANSWER_CHARS = 256 * 1024;

// src/dev/relayQueue.ts
var MAX_RELAY_PENDING_REQUESTS = 100;
var DEFAULT_RELAY_QUEUE_LIMITS = {
  maxInFlight: MAX_RELAY_PENDING_REQUESTS,
  maxPerOwner: 16,
  maxPerBoard: 48,
  maxBytes: 16 * 1024 * 1024
};

// src/server/resultText.ts
var MAX_CHARS = 4e3;
var MAX_ITEMS = 60;
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function str(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
function oneLine(value, max = 120) {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}\u2026` : flat;
}
function describeStructuredResult(toolName, structured) {
  if (structured === null) {
    return "Done.";
  }
  const lines = [];
  if (toolName === "convyy_pages" && Array.isArray(structured.pages)) {
    const pages = structured.pages.filter(isRecord2);
    const active = str(structured.activePageId);
    lines.push(`Pages (${pages.length}):`);
    pages.slice(0, MAX_ITEMS).forEach((page) => {
      lines.push(`- ${oneLine(str(page.name) ?? "(unnamed)", 80)} (id ${str(page.id) ?? "?"})${str(page.id) === active ? " \u2014 open on the board" : ""}`);
    });
    if (pages.length > MAX_ITEMS) {
      lines.push(`\u2026 and ${pages.length - MAX_ITEMS} more pages`);
    }
    lines.push(active ? `Open page id: ${active}.` : "No page is open.");
  } else if (toolName === "convyy_revert" && typeof structured.reverted === "boolean") {
    lines.push(
      structured.reverted ? "Reverted the last AI batch of this session." : structured.reason === "tainted" ? "Not reverted: the last AI batch was edited after it was committed. Nothing was changed." : "Nothing was reverted: this session has no AI batch to undo."
    );
  } else {
    const summary = str(structured.summary);
    if (summary) {
      lines.push(summary);
    }
    for (const [key, value] of Object.entries(structured)) {
      if (key === "summary" || value === null || value === void 0) {
        continue;
      }
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        lines.push(`${key}: ${oneLine(String(value), 200)}`);
      } else if (Array.isArray(value)) {
        const named = value.map((entry) => isRecord2(entry) ? [str(entry.id), str(entry.name) ?? str(entry.title)].filter(Boolean).join(" ") : typeof entry === "string" ? entry : "").filter((entry) => entry !== "").slice(0, MAX_ITEMS);
        lines.push(`${key} (${value.length})${named.length > 0 ? `: ${named.map((entry) => oneLine(entry, 80)).join(", ")}` : ""}`);
      }
    }
  }
  const text = lines.join("\n") || "Done.";
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS - 1)}\u2026` : text;
}
function ensureToolResultContent(request, response) {
  if (request.method !== "tools/call") {
    return response;
  }
  const result = response.result;
  if (!isRecord2(result) || Array.isArray(result.content)) {
    return response;
  }
  const structured = isRecord2(result.structuredContent) ? result.structuredContent : null;
  const name = isRecord2(request.params) && typeof request.params.name === "string" ? request.params.name : null;
  return {
    ...response,
    result: {
      ...result,
      content: [{ type: "text", text: describeStructuredResult(name, structured) }],
      isError: typeof result.isError === "boolean" ? result.isError : false
    }
  };
}

// src/generated/wireLimits.json
var wireLimits_default = {
  schema: "convyy-mcp-wire-limits.v1",
  bodyBytes: 8388608,
  envelopeBytes: 131072,
  payloadBytes: 8257536,
  asset: {
    maxImageBytes: 6e6,
    maxImageBase64Length: 8e6,
    maxImagePixels: 4e7,
    maxImagesPerCall: 12,
    fetchTimeoutMs: 8e3,
    resolveBudgetMs: 12e3,
    maxRedirects: 3
  }
};

// src/server/wireLimits.ts
var WIRE_BODY_BYTES = wireLimits_default.bodyBytes;
var WIRE_ENVELOPE_BYTES = wireLimits_default.envelopeBytes;
var WIRE_PAYLOAD_BYTES = wireLimits_default.payloadBytes;

// src/dev/devRelayServer.ts
var MAX_REQUEST_BODY_BYTES = WIRE_BODY_BYTES;
function isRecord3(value) {
  return typeof value === "object" && value !== null;
}
var RelayTransportError = class extends Error {
  /** True when the request certainly never left this process (no token file, connection refused). */
  neverSent;
  constructor(message, neverSent, options) {
    super(message, options);
    this.name = "RelayTransportError";
    this.neverSent = neverSent;
  }
};
function errorCode(error) {
  const direct = isRecord3(error) && typeof error.code === "string" ? error.code : null;
  const cause = isRecord3(error) && isRecord3(error.cause) && typeof error.cause.code === "string" ? error.cause.code : null;
  return direct ?? cause;
}
function transportFailure(error, whileSending) {
  const code = errorCode(error);
  const neverSent = !whileSending || code === "ECONNREFUSED" || code === "ENOENT";
  const detail = error instanceof Error ? error.message : "unknown error";
  return new RelayTransportError(`Convyy relay is not reachable (${code ?? detail}).`, neverSent, { cause: error });
}
async function forwardAgentRequest(host, port, request, timeoutMs, connectionId, operation) {
  let agentToken;
  try {
    agentToken = fs2.readFileSync(getRelayAgentTokenPath(port), "utf8").trim();
  } catch (error) {
    throw transportFailure(error, false);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs + 2e3);
  try {
    let httpResponse;
    let payload;
    try {
      httpResponse = await fetch(`http://${host}:${port}/agent/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CONVYY_RELAY_AGENT_TOKEN_HEADER]: agentToken,
          ...connectionId ? { [CONVYY_RELAY_CONNECTION_ID_HEADER]: connectionId } : {},
          ...operation ? {
            [CONVYY_RELAY_OPERATION_ID_HEADER]: operation.id,
            [CONVYY_RELAY_ATTEMPT_HEADER]: String(operation.attempt)
          } : {}
        },
        body: JSON.stringify(request),
        signal: controller.signal
      });
      payload = await httpResponse.json();
    } catch (error) {
      throw transportFailure(error, true);
    }
    if (httpResponse.status === 413) {
      return createJsonRpcError(
        request.id ?? null,
        CONVYY_RELAY_ROUTING_ERROR,
        `The request is larger than the relay accepts (${MAX_REQUEST_BODY_BYTES} bytes). Nothing was executed; send less data per call.`,
        { code: RELAY_ROUTING_CODES.LIMIT_EXCEEDED, outcome: "not_executed", maxBytes: MAX_REQUEST_BODY_BYTES }
      );
    }
    if (!payload || payload.ok !== true) {
      throw new Error(
        typeof payload?.error === "string" ? payload.error : `Convyy relay rejected the agent request (status ${httpResponse.status}).`
      );
    }
    return payload.response ?? null;
  } finally {
    clearTimeout(timer);
  }
}
async function connectAgent(host, port, agent, timeoutMs) {
  let agentToken;
  try {
    agentToken = fs2.readFileSync(getRelayAgentTokenPath(port), "utf8").trim();
  } catch (error) {
    throw transportFailure(error, false);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let httpResponse;
    let payload = null;
    try {
      httpResponse = await fetch(`http://${host}:${port}/agent/connect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CONVYY_RELAY_AGENT_TOKEN_HEADER]: agentToken
        },
        body: JSON.stringify({ agent }),
        signal: controller.signal
      });
      if (httpResponse.status === 503) {
        throw new RelayTransportError("The Convyy relay is restarting for an update.", true);
      }
      payload = await httpResponse.json();
    } catch (error) {
      throw error instanceof RelayTransportError ? error : transportFailure(error, false);
    }
    if (payload?.ok === true && typeof payload.connectionId === "string") {
      return payload.connectionId;
    }
    throw new RelayTransportError(
      `The Convyy relay did not issue a connection (status ${httpResponse.status}); it is probably an outdated version.`,
      true
    );
  } finally {
    clearTimeout(timer);
  }
}
function isUnknownConnectionResponse(response) {
  const data = response?.error?.data;
  return isRecord3(data) && data.code === RELAY_ROUTING_CODES.UNKNOWN_CONNECTION;
}
function isUnknownOutcomeResponse(response) {
  const data = response?.error?.data;
  return response?.error?.code === CONVYY_RELAY_ROUTING_ERROR && isRecord3(data) && data.outcome === "unknown";
}
function createAgentChannel(host, port, timeoutMs, channelOptions = {}) {
  let connectionId;
  let connecting = null;
  const sleep = channelOptions.sleep ?? ((ms) => new Promise((resolve2) => setTimeout(resolve2, ms)));
  const maxAttempts = channelOptions.maxAttempts ?? 3;
  const retryDelayMs = channelOptions.retryDelayMs ?? 400;
  const recoveryDelayMs = channelOptions.recoveryDelayMs ?? 1500;
  const createOperationId = channelOptions.createOperationId ?? (() => `op-${randomUUID()}`);
  let agentLabel = null;
  function ensureConnection(agent) {
    agentLabel = agent ?? agentLabel;
    if (connectionId !== void 0) {
      return Promise.resolve(connectionId);
    }
    connecting ??= connectAgent(host, port, agent, timeoutMs).then((id) => {
      connectionId = id;
      return id;
    }).finally(() => {
      connecting = null;
    });
    return connecting;
  }
  async function send(request, operation) {
    let response = await forwardAgentRequest(
      host,
      port,
      request,
      timeoutMs,
      await ensureConnection(agentLabel),
      operation
    );
    if (isUnknownConnectionResponse(response)) {
      connectionId = void 0;
      response = await forwardAgentRequest(
        host,
        port,
        request,
        timeoutMs,
        await ensureConnection(agentLabel),
        operation
      );
    }
    return response;
  }
  function unreachable(request, operationId, maybeDelivered) {
    return maybeDelivered ? createJsonRpcError(
      request.id ?? null,
      CONVYY_RELAY_ROUTING_ERROR,
      "The connection to the Convyy relay broke while the call was running. It may or may not have been applied: check the board before repeating the call.",
      { code: RELAY_ROUTING_CODES.OUTCOME_UNKNOWN, outcome: "unknown", operationId }
    ) : createJsonRpcError(
      request.id ?? null,
      CONVYY_RELAY_ROUTING_ERROR,
      "The Convyy relay is not reachable. Nothing was executed.",
      { code: RELAY_ROUTING_CODES.UNAVAILABLE, outcome: "not_executed", operationId }
    );
  }
  return {
    async connect(agent) {
      await ensureConnection(agent);
    },
    async heartbeat() {
      if (typeof connectionId !== "string") {
        return;
      }
      let agentToken;
      try {
        agentToken = fs2.readFileSync(getRelayAgentTokenPath(port), "utf8").trim();
      } catch (error) {
        throw transportFailure(error, false);
      }
      try {
        const reply = await fetch(`http://${host}:${port}/agent/heartbeat`, {
          method: "POST",
          headers: { "Content-Type": "application/json", [CONVYY_RELAY_AGENT_TOKEN_HEADER]: agentToken },
          body: JSON.stringify({ connectionId }),
          signal: AbortSignal.timeout(Math.min(timeoutMs, 5e3))
        });
        const payload = await reply.json();
        if (payload.ok === false && payload.code === RELAY_ROUTING_CODES.UNKNOWN_CONNECTION) {
          connectionId = void 0;
          await ensureConnection(agentLabel);
        }
      } catch (error) {
        throw error instanceof RelayTransportError ? error : transportFailure(error, false);
      }
    },
    async forward(request) {
      if (request.method !== "tools/call") {
        return send(request);
      }
      const operationId = createOperationId();
      const startedAt = Date.now();
      let attempt = 1;
      let maybeDelivered = false;
      let transportTries = 0;
      let recovered = false;
      for (; ; ) {
        try {
          const response = await send(request, { id: operationId, attempt });
          if (isUnknownOutcomeResponse(response) && !recovered && Date.now() - startedAt < timeoutMs * 2) {
            recovered = true;
            attempt += 1;
            await sleep(recoveryDelayMs);
            return await send(request, { id: operationId, attempt }) ?? response;
          }
          return response;
        } catch (error) {
          if (!(error instanceof RelayTransportError)) {
            throw error;
          }
          transportTries += 1;
          if (!error.neverSent) {
            maybeDelivered = true;
            attempt += 1;
          }
          if (transportTries >= maxAttempts || Date.now() - startedAt >= timeoutMs) {
            return unreachable(request, operationId, maybeDelivered);
          }
          await sleep(retryDelayMs * transportTries);
          try {
            await channelOptions.ensureRelay?.();
          } catch {
          }
          if (maybeDelivered && channelOptions.relayCanDeduplicate && !await channelOptions.relayCanDeduplicate()) {
            return unreachable(request, operationId, true);
          }
        }
      }
    }
  };
}

// src/assets/assetPolicy.ts
import { promises as fs3 } from "node:fs";
import os2 from "node:os";
import path2 from "node:path";
async function realpathOrNull(target) {
  try {
    return await fs3.realpath(target);
  } catch {
    return null;
  }
}
function createAssetPolicy(env = process.env, overrides = {}) {
  const asset = wireLimits_default.asset;
  let cachedRoots = null;
  const fileRoots = () => {
    cachedRoots ??= (async () => {
      const candidates = [
        os2.homedir(),
        os2.tmpdir(),
        ...process.platform === "win32" ? [] : ["/tmp"],
        ...(env.CONVYY_MCP_FILE_ROOTS ?? "").split(path2.delimiter).filter((entry) => entry.trim() !== "")
      ].filter((entry) => path2.isAbsolute(entry));
      const resolved = await Promise.all(candidates.map(realpathOrNull));
      return [...new Set(resolved.filter((entry) => entry !== null))];
    })();
    return cachedRoots;
  };
  return {
    maxImageBytes: asset.maxImageBytes,
    maxImagePixels: asset.maxImagePixels,
    maxImagesPerCall: asset.maxImagesPerCall,
    fetchTimeoutMs: asset.fetchTimeoutMs,
    resolveBudgetMs: asset.resolveBudgetMs,
    maxRedirects: asset.maxRedirects,
    payloadBytes: wireLimits_default.payloadBytes,
    filesEnabled: env.CONVYY_MCP_IMAGE_FILES?.toLowerCase() !== "off",
    urlsEnabled: env.CONVYY_MCP_IMAGE_URLS?.toLowerCase() !== "off",
    fileRoots,
    ...overrides
  };
}

// src/assets/assetError.ts
var AssetError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "AssetError";
    this.code = code;
  }
};

// src/assets/fileSource.ts
import { promises as fs4, constants as fsConstants } from "node:fs";
import path3 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/assets/imageSniff.ts
var PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
function ascii(bytes, offset, length) {
  let text = "";
  for (let index = 0; index < length; index += 1) {
    text += String.fromCharCode(bytes[offset + index] ?? 0);
  }
  return text;
}
var u16be = (bytes, at) => (bytes[at] ?? 0) << 8 | (bytes[at + 1] ?? 0);
var u16le = (bytes, at) => (bytes[at] ?? 0) | (bytes[at + 1] ?? 0) << 8;
var u24le = (bytes, at) => (bytes[at] ?? 0) | (bytes[at + 1] ?? 0) << 8 | (bytes[at + 2] ?? 0) << 16;
var u32be = (bytes, at) => (bytes[at] ?? 0) * 16777216 + ((bytes[at + 1] ?? 0) << 16 | (bytes[at + 2] ?? 0) << 8 | (bytes[at + 3] ?? 0)) >>> 0;
function sniffPng(bytes) {
  if (bytes.length < 24 || !PNG_SIGNATURE.every((value, index) => bytes[index] === value)) {
    return null;
  }
  if (u32be(bytes, 8) !== 13 || ascii(bytes, 12, 4) !== "IHDR") {
    return null;
  }
  const width = u32be(bytes, 16);
  const height = u32be(bytes, 20);
  return width > 0 && height > 0 ? { mimeType: "image/png", width, height } : null;
}
function sniffJpeg(bytes) {
  if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) {
    return null;
  }
  let position = 2;
  while (position + 4 <= bytes.length) {
    if (bytes[position] !== 255) {
      return null;
    }
    const marker = bytes[position + 1] ?? 0;
    if (marker === 255) {
      position += 1;
      continue;
    }
    if (marker === 216 || marker === 1 || marker >= 208 && marker <= 215) {
      position += 2;
      continue;
    }
    if (marker === 217 || marker === 218) {
      return null;
    }
    const length = u16be(bytes, position + 2);
    const isFrameHeader = marker >= 192 && marker <= 207 && marker !== 196 && marker !== 200 && marker !== 204;
    if (isFrameHeader) {
      if (position + 9 > bytes.length) {
        return null;
      }
      const height = u16be(bytes, position + 5);
      const width = u16be(bytes, position + 7);
      return width > 0 && height > 0 ? { mimeType: "image/jpeg", width, height } : null;
    }
    if (length < 2) {
      return null;
    }
    position += 2 + length;
  }
  return null;
}
function sniffWebp(bytes) {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") {
    return null;
  }
  const chunk = ascii(bytes, 12, 4);
  let width = 0;
  let height = 0;
  if (chunk === "VP8 ") {
    if (bytes[23] !== 157 || bytes[24] !== 1 || bytes[25] !== 42) {
      return null;
    }
    width = u16le(bytes, 26) & 16383;
    height = u16le(bytes, 28) & 16383;
  } else if (chunk === "VP8L") {
    if (bytes[20] !== 47) {
      return null;
    }
    const b1 = bytes[21] ?? 0;
    const b2 = bytes[22] ?? 0;
    const b3 = bytes[23] ?? 0;
    const b4 = bytes[24] ?? 0;
    width = 1 + (b1 | (b2 & 63) << 8);
    height = 1 + (b2 >> 6 | b3 << 2 | (b4 & 15) << 10);
  } else if (chunk === "VP8X") {
    width = 1 + u24le(bytes, 24);
    height = 1 + u24le(bytes, 27);
  } else {
    return null;
  }
  return width > 0 && height > 0 ? { mimeType: "image/webp", width, height } : null;
}
function sniffImage(bytes) {
  return sniffPng(bytes) ?? sniffJpeg(bytes) ?? sniffWebp(bytes);
}

// src/assets/fileSource.ts
var MAX_PATH_LENGTH = 4096;
function toLocalPath(raw) {
  const value = raw.trim();
  if (value === "" || value.length > MAX_PATH_LENGTH || value.includes("\0")) {
    throw new AssetError("invalid_path", "the path is empty, too long or contains a NUL character");
  }
  let candidate = value;
  if (/^file:/i.test(value)) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new AssetError("invalid_path", "the file:// URL is not valid");
    }
    if (url.hostname !== "" && url.hostname !== "localhost") {
      throw new AssetError("invalid_path", "a file:// URL must point to this computer");
    }
    try {
      candidate = fileURLToPath2(url);
    } catch {
      throw new AssetError("invalid_path", "the file:// URL is not a local path");
    }
  }
  if (!path3.isAbsolute(candidate)) {
    throw new AssetError("invalid_path", "use an absolute path (or a file:// URL); relative paths are not resolved");
  }
  return path3.normalize(candidate);
}
function isInside(root, target) {
  const relative = path3.relative(root, target);
  return relative === "" || !relative.startsWith("..") && !path3.isAbsolute(relative);
}
async function readLocalImage(raw, policy) {
  if (!policy.filesEnabled) {
    throw new AssetError("disabled", "reading local files is switched off for this Convyy connector");
  }
  const requested = toLocalPath(raw);
  let real;
  try {
    real = await fs4.realpath(requested);
  } catch (error) {
    const code = error.code;
    throw new AssetError(
      code === "ENOENT" || code === "ENOTDIR" ? "not_found" : "unreadable",
      code === "ENOENT" || code === "ENOTDIR" ? "the file was not found" : "the file could not be read"
    );
  }
  const roots = await policy.fileRoots();
  if (!roots.some((root) => isInside(root, real))) {
    throw new AssetError(
      "file_scope",
      "the file is outside the folders this connector reads images from (your home folder and the temp folder; more can be allowed with CONVYY_MCP_FILE_ROOTS)"
    );
  }
  let handle = null;
  try {
    handle = await fs4.open(real, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw new AssetError("not_a_file", "the path is not a regular file");
    }
    if (stat.size > policy.maxImageBytes) {
      throw new AssetError("file_too_large", `the file is ${stat.size} bytes; the limit is ${policy.maxImageBytes} bytes`);
    }
    const buffer = Buffer.alloc(Math.min(stat.size, policy.maxImageBytes) + 1);
    let filled = 0;
    while (filled < buffer.length) {
      const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, filled);
      if (bytesRead === 0) {
        break;
      }
      filled += bytesRead;
    }
    if (filled > policy.maxImageBytes) {
      throw new AssetError("file_too_large", `the file is larger than the limit of ${policy.maxImageBytes} bytes`);
    }
    return verifyImageBytes(new Uint8Array(buffer.buffer, buffer.byteOffset, filled), policy);
  } catch (error) {
    if (error instanceof AssetError) {
      throw error;
    }
    throw new AssetError("unreadable", "the file could not be read");
  } finally {
    await handle?.close().catch(() => void 0);
  }
}
function verifyImageBytes(bytes, policy) {
  if (bytes.byteLength > policy.maxImageBytes) {
    throw new AssetError("file_too_large", `the image is ${bytes.byteLength} bytes; the limit is ${policy.maxImageBytes} bytes`);
  }
  const image = sniffImage(bytes);
  if (image === null) {
    throw new AssetError("unsupported_type", "the content is not a PNG, JPEG or WebP image");
  }
  if (image.width * image.height > policy.maxImagePixels) {
    throw new AssetError(
      "too_many_pixels",
      `the image is ${image.width}x${image.height} pixels; the limit is ${policy.maxImagePixels} pixels`
    );
  }
  return { bytes, image };
}

// src/assets/urlSource.ts
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net2 from "node:net";

// src/assets/addressGuard.ts
import net from "node:net";
function parseIpv4(address) {
  const parts = address.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const numbers = parts.map((part) => /^\d{1,3}$/.test(part) ? Number(part) : Number.NaN);
  return numbers.every((value) => value >= 0 && value <= 255) ? numbers : null;
}
function isBlockedIpv4(octets) {
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a >= 224) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 192 && b === 88 && c === 99) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  return false;
}
function parseIpv6(address) {
  let text = address.split("%")[0] ?? address;
  if (!text.includes(":")) {
    return null;
  }
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIpv4(tail);
    if (v4 === null) {
      return null;
    }
    text = `${text.slice(0, lastColon + 1)}${(v4[0] << 8 | v4[1]).toString(16)}:${(v4[2] << 8 | v4[3]).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) {
    return null;
  }
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 ? halves[1] ? halves[1].split(":") : [] : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 && head.length !== 8 || halves.length === 2 && missing < 1) {
    return null;
  }
  const groups = halves.length === 2 ? [...head, ...Array(missing).fill("0"), ...rest] : head;
  const bytes = [];
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) {
      return null;
    }
    const value = Number.parseInt(group, 16);
    bytes.push(value >> 8, value & 255);
  }
  return bytes.length === 16 ? bytes : null;
}
function isBlockedIpv6(bytes) {
  const embeddedV4 = (offset) => bytes.slice(offset, offset + 4);
  const allZero = (from, to) => bytes.slice(from, to).every((value) => value === 0);
  if (allZero(0, 10) && bytes[10] === 255 && bytes[11] === 255) {
    return isBlockedIpv4(embeddedV4(12));
  }
  if (bytes[0] === 32 && bytes[1] === 2) {
    return isBlockedIpv4(embeddedV4(2));
  }
  if ((bytes[0] & 224) !== 32) {
    return true;
  }
  if (bytes[0] === 32 && bytes[1] === 1 && bytes[2] === 13 && bytes[3] === 184) return true;
  if (bytes[0] === 32 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) return true;
  if (bytes[0] === 32 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] < 32) return true;
  if (bytes[0] === 63 && bytes[1] === 255 && (bytes[2] & 240) === 0) return true;
  return false;
}
function isBlockedAddress(address) {
  const host = address.startsWith("[") && address.endsWith("]") ? address.slice(1, -1) : address;
  const family = net.isIP(host);
  if (family === 4) {
    const octets = parseIpv4(host);
    return octets === null ? true : isBlockedIpv4(octets);
  }
  if (family === 6) {
    const bytes = parseIpv6(host);
    return bytes === null ? true : isBlockedIpv6(bytes);
  }
  return true;
}

// src/assets/urlSource.ts
var REDIRECT_STATUSES = /* @__PURE__ */ new Set([301, 302, 303, 307, 308]);
function describeHost(url) {
  return url.host;
}
async function resolveAddresses(hostname, policy) {
  const literal = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  if (net2.isIP(literal)) {
    return [literal];
  }
  if (policy.lookup) {
    return policy.lookup(literal);
  }
  const answers = await dns.promises.lookup(literal, { all: true, verbatim: true });
  return answers.map((answer) => answer.address);
}
function requestHop(url, address, deadlineAt, policy) {
  return new Promise((resolve2, reject) => {
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) {
      reject(new AssetError("timeout", "the download took too long"));
      return;
    }
    const transport = url.protocol === "https:" ? https : http;
    const family = net2.isIP(address);
    const request = transport.request(
      {
        method: "GET",
        protocol: url.protocol,
        // The TLS name and the Host header stay the URL's host; the TCP connection goes to the checked address.
        hostname: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port || void 0,
        path: `${url.pathname}${url.search}`,
        agent: false,
        headers: {
          Accept: "image/png,image/jpeg,image/webp",
          "Accept-Encoding": "identity",
          "User-Agent": "convyy-mcp-image-fetch"
        },
        lookup: (_hostname, options, callback) => {
          const done = callback;
          if (typeof options === "object" && options !== null && options.all) {
            done(null, [{ address, family }]);
          } else {
            done(null, address, family);
          }
        }
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (REDIRECT_STATUSES.has(status)) {
          response.resume();
          const location = response.headers.location ?? null;
          clearTimeout(timer);
          resolve2({ status, location: typeof location === "string" ? location : null, bytes: null });
          return;
        }
        if (status !== 200) {
          response.resume();
          clearTimeout(timer);
          reject(new AssetError("http_error", `the server answered ${status}`));
          return;
        }
        const declared = Number.parseInt(String(response.headers["content-length"] ?? ""), 10);
        if (Number.isFinite(declared) && declared > policy.maxImageBytes) {
          response.destroy();
          clearTimeout(timer);
          reject(new AssetError("file_too_large", `the server announces ${declared} bytes; the limit is ${policy.maxImageBytes} bytes`));
          return;
        }
        const chunks = [];
        let received = 0;
        response.on("data", (chunk) => {
          received += chunk.length;
          if (received > policy.maxImageBytes) {
            response.destroy();
            clearTimeout(timer);
            reject(new AssetError("file_too_large", `the download is larger than the limit of ${policy.maxImageBytes} bytes`));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          clearTimeout(timer);
          const joined = Buffer.concat(chunks);
          resolve2({ status, location: null, bytes: new Uint8Array(joined.buffer, joined.byteOffset, joined.length) });
        });
        response.on("error", () => {
          clearTimeout(timer);
          reject(new AssetError("network_error", "the connection broke during the download"));
        });
      }
    );
    const timer = setTimeout(() => {
      request.destroy();
      reject(new AssetError("timeout", "the download took too long"));
    }, remaining);
    request.on("error", () => {
      clearTimeout(timer);
      reject(new AssetError("network_error", `could not connect to ${describeHost(url)}`));
    });
    request.end();
  });
}
function parseHttpUrl(raw, base) {
  let url;
  try {
    url = new URL(raw, base);
  } catch {
    throw new AssetError("invalid_url", "the URL is not valid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AssetError("scheme_not_allowed", `only http and https URLs are downloaded, not ${url.protocol}`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new AssetError("credentials_in_url", "URLs with a user name or password are not downloaded");
  }
  if (url.hostname === "") {
    throw new AssetError("invalid_url", "the URL has no host");
  }
  return url;
}
async function fetchImageFromUrl(raw, policy, deadlineAt) {
  if (!policy.urlsEnabled) {
    throw new AssetError("disabled", "downloading URLs is switched off for this Convyy connector");
  }
  const blocked = policy.isBlockedAddress ?? isBlockedAddress;
  const deadline = Math.min(deadlineAt ?? Number.POSITIVE_INFINITY, Date.now() + policy.fetchTimeoutMs);
  let url = parseHttpUrl(raw.trim());
  for (let hops = 0; ; hops += 1) {
    let addresses;
    try {
      addresses = await resolveAddresses(url.hostname, policy);
    } catch {
      throw new AssetError("network_error", `could not resolve ${describeHost(url)}`);
    }
    if (addresses.length === 0) {
      throw new AssetError("network_error", `could not resolve ${describeHost(url)}`);
    }
    if (addresses.some((address) => blocked(address))) {
      throw new AssetError("blocked_address", `${describeHost(url)} is not a public internet address`);
    }
    const hop = await requestHop(url, addresses[0], deadline, policy);
    if (hop.bytes !== null) {
      return verifyImageBytes(hop.bytes, policy);
    }
    if (hops >= policy.maxRedirects) {
      throw new AssetError("too_many_redirects", `more than ${policy.maxRedirects} redirects`);
    }
    if (hop.location === null) {
      throw new AssetError("http_error", "the server redirected without saying where");
    }
    const next = parseHttpUrl(hop.location, url);
    if (url.protocol === "https:" && next.protocol === "http:") {
      throw new AssetError("redirect_blocked", "a redirect from https to http is not followed");
    }
    url = next;
  }
}

// src/assets/drawAssets.ts
var IMAGE_SOURCE_ALIASES = ["url", "imageUrl", "src", "path", "filePath", "localPath"];
function isRecord4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isImageElement(element) {
  if (typeof element.kind === "string") {
    return element.kind === "image";
  }
  if (element.from != null || element.to != null || element.source != null || element.target != null) {
    return false;
  }
  return typeof element.data === "string" || typeof element.assetId === "string" || Array.isArray(element.dataChunks) || IMAGE_SOURCE_ALIASES.some((alias) => typeof element[alias] === "string");
}
function sourceOf(element) {
  for (const alias of IMAGE_SOURCE_ALIASES) {
    const value = element[alias];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return null;
}
function withoutAliases(element) {
  const copy = { ...element };
  for (const alias of IMAGE_SOURCE_ALIASES) {
    delete copy[alias];
  }
  return copy;
}
function classify(source) {
  if (/^https?:\/\//i.test(source)) {
    return "url";
  }
  if (/^data:/i.test(source)) {
    return "inline";
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(source) && !/^file:/i.test(source) && !/^[a-z]:[\\/]/i.test(source)) {
    return "url";
  }
  return "file";
}
function toBase64(bytes) {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}
async function resolveDrawImageSources(request, policy, report) {
  const params = request.params;
  if (request.method !== "tools/call" || !isRecord4(params) || params.name !== "convyy_draw" || !isRecord4(params.arguments)) {
    return request;
  }
  const args = params.arguments;
  if (!Array.isArray(args.elements)) {
    return request;
  }
  const pending = [];
  args.elements.forEach((element, index) => {
    if (!isRecord4(element) || !isImageElement(element)) {
      return;
    }
    const sources = Number(typeof element.data === "string" && element.data !== "") + Number(Array.isArray(element.dataChunks)) + Number(typeof element.assetId === "string" && element.assetId !== "") + Number(sourceOf(element) !== null);
    const source = sourceOf(element);
    if (source !== null && sources === 1 && classify(source) !== "inline") {
      pending.push(index);
    }
  });
  if (pending.length === 0) {
    return request;
  }
  const elements = [...args.elements];
  const deadlineAt = Date.now() + policy.resolveBudgetMs;
  let payloadBytes = Buffer.byteLength(JSON.stringify(request), "utf8");
  let placed = 0;
  for (const index of pending) {
    const element = elements[index];
    const source = sourceOf(element);
    try {
      if (placed >= policy.maxImagesPerCall) {
        throw new AssetError("too_many_images", `one call places at most ${policy.maxImagesPerCall} images`);
      }
      if (Date.now() >= deadlineAt) {
        throw new AssetError("timeout", "the images of this call took too long to bring");
      }
      const loaded = classify(source) === "url" ? await fetchImageFromUrl(source, policy, deadlineAt) : await readLocalImage(source, policy);
      const data = toBase64(loaded.bytes);
      if (payloadBytes + data.length > policy.payloadBytes) {
        throw new AssetError(
          "payload_budget",
          `the image would make the call larger than the ${policy.payloadBytes} bytes the connection carries; send fewer or smaller images`
        );
      }
      payloadBytes += data.length;
      placed += 1;
      elements[index] = { ...withoutAliases(element), data, mimeType: loaded.image.mimeType };
      if (report) report.resolved += 1;
    } catch (error) {
      const assetError = error instanceof AssetError ? error : new AssetError("unreadable", "the image source could not be brought");
      elements[index] = { ...withoutAliases(element), _assetError: { code: assetError.code, message: assetError.message } };
      if (report) report.failed += 1;
    }
  }
  return {
    ...request,
    params: { ...params, arguments: { ...args, elements } }
  };
}

// src/server/relayConnector.ts
function isRecord5(value) {
  return typeof value === "object" && value !== null;
}
function handleConnectorMessage(request, state) {
  if (request.method === "initialize") {
    const clientInfo = isRecord5(request.params) && isRecord5(request.params.clientInfo) ? request.params.clientInfo : null;
    state.agentName = clientInfo && typeof clientInfo.name === "string" ? clientInfo.name : null;
    return createJsonRpcResult(request.id ?? null, {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {
          listChanged: false
        }
      },
      serverInfo: {
        name: "@convyy/mcp",
        version: "0.1.0"
      }
    });
  }
  if (request.method === "ping") {
    return createJsonRpcResult(request.id ?? null, {});
  }
  if (request.method === "notifications/initialized") {
    return null;
  }
  if (request.method === "tools/list") {
    return createJsonRpcResult(request.id ?? null, {
      tools: buildMcpToolsList()
    });
  }
  return void 0;
}
function failureResponse(id, error) {
  if (error instanceof RelayBootstrapError) {
    return createJsonRpcError(id, CONVYY_RELAY_ROUTING_ERROR, error.message, { code: error.code, outcome: "not_executed" });
  }
  return createJsonRpcError(id, -32e3, error instanceof Error ? error.message : "Convyy relay bootstrap failed.");
}
function createRelayConnector(options) {
  const useRelay = options.relay !== false;
  const log = options.log ?? (() => void 0);
  const state = { agentName: null };
  const ensureRelay = () => ensureRelayProcess({
    host: options.host,
    port: options.port,
    requestTimeoutMs: options.requestTimeoutMs,
    nodeExecPath: options.nodeExecPath
  });
  const channel = createAgentChannel(options.host, options.port, options.requestTimeoutMs, {
    ensureRelay,
    // Only a relay that knows operation ids may see a call a second time.
    relayCanDeduplicate: async () => {
      const inspection = await inspectRelay({ host: options.host, port: options.port });
      return inspection.state === "ready" && inspection.capabilities.includes("operations");
    }
  });
  const relayReady = useRelay ? ensureRelay() : Promise.reject(new RelayBootstrapError("relay_unavailable", "This connector runs without a relay (--no-relay)."));
  const assetPolicy = createAssetPolicy();
  let heartbeatTimer = null;
  const beat = async () => {
    try {
      await relayReady;
      await channel.connect(state.agentName);
      await channel.heartbeat();
    } catch {
      try {
        await ensureRelay();
      } catch (error) {
        log(`Convyy MCP relay is not available: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
  };
  const startHeartbeat = () => {
    if (!useRelay || heartbeatTimer) {
      return;
    }
    void beat();
    heartbeatTimer = setInterval(() => void beat(), CONVYY_RELAY_HEARTBEAT_INTERVAL_MS);
    heartbeatTimer.unref?.();
  };
  void relayReady.catch((error) => {
    if (useRelay) {
      log(`Convyy MCP relay bootstrap failed: ${error instanceof Error ? error.message : "Unknown error."}`);
    }
  });
  return {
    async handle(payload) {
      if (!isRecord5(payload) || payload.jsonrpc !== "2.0" || typeof payload.method !== "string") {
        return createJsonRpcError(null, -32600, "Invalid Request");
      }
      const request = payload;
      const local = handleConnectorMessage(request, state);
      if (request.method === "initialize") {
        startHeartbeat();
      }
      if (local !== void 0) {
        return local || null;
      }
      try {
        await relayReady;
        await channel.connect(state.agentName);
        const prepared = await resolveDrawImageSources(request, assetPolicy);
        const response = await channel.forward(prepared);
        return response ? ensureToolResultContent(request, response) : null;
      } catch (error) {
        return failureResponse(request.id ?? null, error);
      }
    },
    close() {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    }
  };
}

// src/server/streamableHttp.ts
import { randomUUID as randomUUID2, timingSafeEqual } from "node:crypto";
import http2 from "node:http";
var STREAMABLE_HTTP_SERVICE = "convyy-mcp-http";
var SESSION_HEADER = "mcp-session-id";
var DEFAULT_SESSION_IDLE_MS = 5 * 60 * 1e3;
var MAX_SESSIONS = 32;
function tokensEqual(expected, received) {
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}
function writeJson(response, status, body, headers = {}) {
  const text = body === void 0 ? "" : JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(text);
}
function readBody(request, limit) {
  return new Promise((resolve2, reject) => {
    const chunks = [];
    let total = 0;
    let tooLarge = false;
    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > limit) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      if (!tooLarge) {
        chunks.push(chunk);
      }
    });
    request.on("end", () => resolve2(tooLarge ? null : Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}
function startStreamableHttpServer(options) {
  const sessions = /* @__PURE__ */ new Map();
  const idleMs = options.sessionIdleMs ?? DEFAULT_SESSION_IDLE_MS;
  const maxBody = options.maxBodyBytes ?? WIRE_BODY_BYTES;
  const log = options.log ?? (() => void 0);
  const createConnector = options.createConnector ?? createRelayConnector;
  const closeSession = (id) => {
    const session = sessions.get(id);
    if (!session) {
      return;
    }
    clearTimeout(session.timer);
    session.connector.close();
    sessions.delete(id);
  };
  const touch = (id, session) => {
    clearTimeout(session.timer);
    session.timer = setTimeout(() => closeSession(id), idleMs);
    session.timer.unref?.();
  };
  const server = http2.createServer(async (request, response) => {
    try {
      if (!isAllowedRelayHost(request.headers.host)) {
        writeJson(response, 403, { error: "Host is not allowed." });
        return;
      }
      if (request.headers.origin !== void 0) {
        writeJson(response, 403, { error: "Browser origins are not allowed." });
        return;
      }
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/health") {
        writeJson(response, 200, { ok: true, service: STREAMABLE_HTTP_SERVICE, version: options.version });
        return;
      }
      const authorization = request.headers.authorization ?? "";
      const bearer = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
      if (!bearer || !tokensEqual(options.token, bearer)) {
        writeJson(response, 401, { error: "A valid bearer token is required." }, { "WWW-Authenticate": "Bearer" });
        return;
      }
      if (request.method === "POST" && url.pathname === "/admin/shutdown") {
        writeJson(response, 200, { ok: true });
        setImmediate(() => options.onShutdown?.());
        return;
      }
      if (url.pathname !== "/mcp") {
        writeJson(response, 404, { error: "Not found." });
        return;
      }
      const sessionId = typeof request.headers[SESSION_HEADER] === "string" ? request.headers[SESSION_HEADER] : void 0;
      if (request.method === "DELETE") {
        if (!sessionId || !sessions.has(sessionId)) {
          writeJson(response, 404, { error: "Unknown session." });
          return;
        }
        closeSession(sessionId);
        writeJson(response, 200, { ok: true });
        return;
      }
      if (request.method !== "POST") {
        writeJson(response, 405, { error: "Use POST." }, { Allow: "POST, DELETE" });
        return;
      }
      const raw = await readBody(request, maxBody);
      if (raw === null) {
        writeJson(response, 413, createJsonRpcError(null, -32002, `The message is larger than ${maxBody} bytes.`));
        return;
      }
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        writeJson(response, 400, createJsonRpcError(null, -32700, "Parse error"));
        return;
      }
      if (Array.isArray(payload)) {
        writeJson(response, 400, createJsonRpcError(null, -32600, "Batch requests are not supported."));
        return;
      }
      const method = typeof payload === "object" && payload !== null ? payload.method : void 0;
      let id = sessionId;
      let session = id ? sessions.get(id) : void 0;
      const headers = {};
      if (method === "initialize" && !session) {
        if (sessions.size >= MAX_SESSIONS) {
          writeJson(response, 503, createJsonRpcError(null, -32e3, "Too many open MCP sessions."));
          return;
        }
        id = randomUUID2();
        session = {
          connector: createConnector({ ...options.connector, log: (message) => log(message) }),
          timer: setTimeout(() => closeSession(id), idleMs)
        };
        session.timer.unref?.();
        sessions.set(id, session);
        headers["Mcp-Session-Id"] = id;
      } else if (!id) {
        writeJson(response, 400, createJsonRpcError(null, -32600, "Mcp-Session-Id is required."));
        return;
      } else if (!session) {
        writeJson(response, 404, createJsonRpcError(null, -32001, "Unknown or expired session."));
        return;
      }
      touch(id, session);
      const hasId = typeof payload === "object" && payload !== null && "id" in payload;
      const result = await session.connector.handle(payload);
      if (!hasId || result === null) {
        response.writeHead(202, headers);
        response.end();
        return;
      }
      writeJson(response, 200, result, headers);
    } catch (error) {
      log(`Convyy MCP HTTP request failed: ${error instanceof Error ? error.message : "unknown error"}`);
      if (!response.headersSent) {
        writeJson(response, 500, createJsonRpcError(null, -32603, "Internal error"));
      } else {
        response.end();
      }
    }
  });
  return new Promise((resolve2, reject) => {
    server.once("error", reject);
    server.listen(options.listenPort, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : options.listenPort;
      resolve2({
        port,
        close: () => new Promise((done) => {
          for (const id of [...sessions.keys()]) {
            closeSession(id);
          }
          server.close(() => done());
          server.closeAllConnections?.();
        })
      });
    });
  });
}

// src/server.ts
var nodeProcess2 = globalThis;
function attachRelayStdioBridge(options) {
  const connector = createRelayConnector({
    host: options.host,
    port: options.port,
    requestTimeoutMs: options.requestTimeoutMs,
    nodeExecPath: nodeProcess2.process?.execPath ?? "node",
    relay: options.relay,
    log: (message) => nodeProcess2.process?.stderr?.write(`${message}
`)
  });
  createStdioMessageReader(async (payload) => {
    const response = await connector.handle(payload);
    if (response) {
      writeFramedJsonRpcMessage(response);
    }
  }, {
    // The same number the relay and the board enforce: a tool call up to this size is promised to pass every hop,
    // a larger one is refused here, at once, with nothing executed (no 413 from a hop further down).
    maxMessageBytes: WIRE_PAYLOAD_BYTES,
    onOversize: ({ id, bytes }) => {
      writeFramedJsonRpcMessage(
        createJsonRpcError(
          id,
          -32002,
          `The message is larger than the connector forwards (${WIRE_PAYLOAD_BYTES} bytes). Nothing was executed; send less data per call.`,
          { code: "limit_exceeded", outcome: "not_executed", maxBytes: WIRE_PAYLOAD_BYTES, receivedBytes: bytes }
        )
      );
    }
  });
}
async function runHttpMode(options) {
  const proc = nodeProcess2.process;
  const stderr = (message) => proc?.stderr?.write(`${message}
`);
  const tokenFile = options.tokenFile ?? getHttpEndpointTokenPath();
  if (!existsSync(tokenFile)) {
    stderr(`convyy-mcp --http: no bearer token at ${tokenFile}. Run the Convyy installer for Open WebUI first.`);
    proc?.exit(1);
    return;
  }
  const token = readFileSync(tokenFile, "utf8").trim();
  if (token.length < 24) {
    stderr("convyy-mcp --http: the bearer token file is empty or too short.");
    proc?.exit(1);
    return;
  }
  try {
    const endpoint = await startStreamableHttpServer({
      listenPort: options.listenPort,
      token,
      version: options.versionLabel,
      connector: {
        host: options.host,
        port: options.relayPort,
        requestTimeoutMs: options.requestTimeoutMs,
        nodeExecPath: proc?.execPath ?? "node",
        relay: options.relay
      },
      log: stderr,
      onShutdown: () => proc?.exit(0)
    });
    proc?.stdout.write(`${JSON.stringify({ listening: true, service: "convyy-mcp-http", port: endpoint.port })}
`);
  } catch (error) {
    stderr(`convyy-mcp --http: cannot listen on 127.0.0.1:${options.listenPort}: ${error instanceof Error ? error.message : "unknown error"}`);
    proc?.exit(1);
  }
}
var USAGE = [
  "Usage: convyy-mcp [--host 127.0.0.1] [--port 4318] [--timeout 15000] [--no-relay] [--manifest] [--help]",
  "       convyy-mcp --http [--listen-port 4319] [--token-file <path>] [--version-label <text>] [--host 127.0.0.1] [--port 4318]",
  "",
  "  (no mode)    MCP over stdio, for Codex, Claude and other clients that start the process.",
  "  --http       native MCP Streamable HTTP on 127.0.0.1 for clients that cannot start a process (Open WebUI);",
  "               needs a bearer token in --token-file (default: the per-user state directory).",
  "  --no-relay   answer the handshake and the tool catalog only; never look for or start a relay.",
  ""
].join("\n");
var REMOVED_FLAGS = ["--local", "--demo"];
function runCli(args) {
  const removed = REMOVED_FLAGS.find((flag) => args.includes(flag));
  if (removed) {
    nodeProcess2.process?.stderr?.write(
      `convyy-mcp: ${removed} was removed. The connector only forwards tool calls to the open Convyy board; run it without ${removed}.
`
    );
    return 2;
  }
  if (args.includes("--manifest")) {
    nodeProcess2.process?.stdout.write(`${JSON.stringify({ tools: buildMcpToolsList() }, null, 2)}
`);
    return 0;
  }
  if (args.includes("--help")) {
    nodeProcess2.process?.stdout.write(USAGE);
    return 0;
  }
  const hostArg = args.indexOf("--host");
  const portArg = args.indexOf("--port");
  const timeoutArg = args.indexOf("--timeout");
  const host = hostArg >= 0 ? args[hostArg + 1] ?? "127.0.0.1" : "127.0.0.1";
  const port = Number.parseInt(portArg >= 0 ? args[portArg + 1] ?? "4318" : "4318", 10);
  const timeoutMs = Number.parseInt(timeoutArg >= 0 ? args[timeoutArg + 1] ?? "15000" : "15000", 10);
  const relayPort = Number.isFinite(port) ? port : 4318;
  const requestTimeoutMs = Number.isFinite(timeoutMs) ? timeoutMs : 15e3;
  if (args.includes("--http")) {
    const listenArg = args.indexOf("--listen-port");
    const tokenFileArg = args.indexOf("--token-file");
    const versionArg = args.indexOf("--version-label");
    const listenPort = Number.parseInt(listenArg >= 0 ? args[listenArg + 1] ?? "" : String(CONVYY_HTTP_DEFAULT_PORT), 10);
    void runHttpMode({
      host,
      relayPort,
      requestTimeoutMs,
      relay: !args.includes("--no-relay"),
      listenPort: Number.isFinite(listenPort) ? listenPort : CONVYY_HTTP_DEFAULT_PORT,
      tokenFile: tokenFileArg >= 0 ? args[tokenFileArg + 1] : void 0,
      versionLabel: versionArg >= 0 ? args[versionArg + 1] ?? CONVYY_RELAY_VERSION : CONVYY_RELAY_VERSION
    });
    return null;
  }
  attachRelayStdioBridge({
    host,
    port: relayPort,
    requestTimeoutMs,
    relay: !args.includes("--no-relay")
  });
  return null;
}
var entrypointArg = nodeProcess2.process?.argv[1];
function toRealFileUrl(file) {
  try {
    return pathToFileURL(realpathSync(resolve(file))).href;
  } catch {
    return pathToFileURL(resolve(file)).href;
  }
}
var entrypointUrl = entrypointArg ? toRealFileUrl(entrypointArg) : null;
if (entrypointUrl !== null && import.meta.url === entrypointUrl) {
  const exitCode = runCli(nodeProcess2.process?.argv.slice(2) ?? []);
  if (typeof exitCode === "number") {
    nodeProcess2.process?.exit(exitCode);
  }
}
export {
  failureResponse,
  handleConnectorMessage,
  runCli
};
