#!/usr/bin/env node

// src/dev/devRelayCli.ts
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// src/dev/devRelayServer.ts
import http from "node:http";
import { randomUUID as randomUUID2 } from "node:crypto";
import fs2 from "node:fs";

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

// src/dev/relayProtocol.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
var CONVYY_RELAY_PROTOCOL_VERSION = "convyy-dev-relay.v1";
var CONVYY_RELAY_CLIENT_ID_HEADER = "x-convyy-relay-client-id";
var CONVYY_RELAY_TOKEN_HEADER = "x-convyy-relay-token";
var CONVYY_RELAY_AGENT_TOKEN_HEADER = "x-convyy-relay-agent-token";
var CONVYY_RELAY_CONNECTION_ID_HEADER = "x-convyy-relay-connection-id";
var CONVYY_RELAY_OPERATION_ID_HEADER = "x-convyy-relay-operation-id";
var CONVYY_RELAY_ATTEMPT_HEADER = "x-convyy-relay-attempt";
var CONVYY_TRUSTED_CONTEXT_PARAM = "_convyyContext";
var CONVYY_TRUSTED_CONTEXT_VERSION = 1;
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
var CONVYY_RELAY_ALLOWED_ORIGIN_SUFFIXES = [
  "http://localhost",
  "http://127.0.0.1",
  "https://convyy.com",
  "https://www.convyy.com",
  "https://whiteboard-sepia.vercel.app",
  "https://convyy-whiteboard.vercel.app"
];
var CONVYY_RELAY_ALLOWED_HOSTS = ["127.0.0.1", "localhost"];
var OPERATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
function isValidOperationId(value) {
  return typeof value === "string" && OPERATION_ID_PATTERN.test(value);
}
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
function ensureMcpStateDir(dir = resolveMcpStateDir()) {
  fs.mkdirSync(dir, { recursive: true, mode: 448 });
  const stat = fs.lstatSync(dir);
  if (!stat.isDirectory()) {
    throw new Error(`The Convyy state path ${dir} is not a plain directory.`);
  }
  if (process.platform !== "win32") {
    if (typeof process.getuid === "function" && stat.uid !== process.getuid()) {
      throw new Error(`The Convyy state directory ${dir} belongs to another user.`);
    }
    if ((stat.mode & 63) !== 0) {
      fs.chmodSync(dir, 448);
    }
  }
  return dir;
}
function getRelayAgentTokenPath(port) {
  return path.join(resolveMcpStateDir(), `relay-${port}.token`);
}
function writeRelayAgentTokenFile(port, token) {
  const tokenPath = getRelayAgentTokenPath(port);
  ensureMcpStateDir(path.dirname(tokenPath));
  fs.writeFileSync(tokenPath, token, { mode: 384 });
  if (process.platform !== "win32") {
    fs.chmodSync(tokenPath, 384);
  }
  return tokenPath;
}
function isAllowedRelayOrigin(origin) {
  if (!origin) {
    return true;
  }
  return CONVYY_RELAY_ALLOWED_ORIGIN_SUFFIXES.some(
    (allowed) => origin === allowed || origin.startsWith(`${allowed}:`)
  );
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
var CONVYY_RELAY_DEFAULT_IDLE_EXIT_MS = 10 * 60 * 1e3;
var CONVYY_RELAY_HEARTBEAT_INTERVAL_MS = 60 * 1e3;
var CONVYY_RELAY_DEFAULT_TOKEN_WATCH_MS = 5e3;
var CONVYY_RELAY_CAPABILITIES = ["operations", "idle-exit", "token-watch", "drain", "heartbeat"];

// src/dev/relayBoards.ts
import { randomUUID } from "node:crypto";
function buildBoardAddress(parts) {
  return JSON.stringify([parts.origin, parts.profileId, parts.boardId]);
}
function createBoardRegistry(options) {
  const byAddress = /* @__PURE__ */ new Map();
  const byHandle = /* @__PURE__ */ new Map();
  const ownerIndex = /* @__PURE__ */ new Map();
  function isLive(record) {
    return record.ownerClientId !== null && options.now() - record.lastSeenAt <= options.livenessMs;
  }
  return {
    register(parts, clientId) {
      const address = buildBoardAddress(parts);
      let record = byAddress.get(address);
      if (!record) {
        record = {
          ...parts,
          address,
          handle: `board-${randomUUID()}`,
          ownerClientId: null,
          epoch: 0,
          lastSeenAt: options.now(),
          off: false
        };
        byAddress.set(address, record);
        byHandle.set(record.handle, record);
      }
      const previousOwnerClientId = record.ownerClientId !== clientId ? record.ownerClientId : null;
      if (previousOwnerClientId) {
        ownerIndex.delete(previousOwnerClientId);
      }
      if (record.ownerClientId !== clientId) {
        record.epoch += 1;
      }
      record.ownerClientId = clientId;
      record.off = false;
      record.lastSeenAt = options.now();
      ownerIndex.set(clientId, address);
      return { record, previousOwnerClientId };
    },
    touch(clientId) {
      const address = ownerIndex.get(clientId);
      const record = address ? byAddress.get(address) : void 0;
      if (record && record.ownerClientId === clientId) {
        record.lastSeenAt = options.now();
      }
    },
    release(clientId, reason = "closed") {
      const address = ownerIndex.get(clientId);
      ownerIndex.delete(clientId);
      const record = address ? byAddress.get(address) : void 0;
      if (!record || record.ownerClientId !== clientId) {
        return null;
      }
      record.ownerClientId = null;
      record.off = reason === "off";
      return record;
    },
    ownedBy(clientId) {
      const address = ownerIndex.get(clientId);
      const record = address ? byAddress.get(address) : void 0;
      return record && record.ownerClientId === clientId ? record : null;
    },
    isCurrentOwner(address, clientId, epoch) {
      const record = byAddress.get(address);
      return Boolean(record && record.ownerClientId === clientId && record.epoch === epoch);
    },
    liveBoards() {
      return [...byAddress.values()].filter(isLive);
    },
    offBoards() {
      return [...byAddress.values()].filter((record) => record.off && record.ownerClientId === null);
    },
    findByHandle(handle) {
      return byHandle.get(handle) ?? null;
    },
    findByAddress(address) {
      return byAddress.get(address) ?? null;
    }
  };
}

// src/dev/relayOperations.ts
var DEFAULT_OPERATION_TTL_MS = 10 * 60 * 1e3;
var DEFAULT_MAX_OPERATION_RECORDS = 256;
var DEFAULT_MAX_CACHED_ANSWER_CHARS = 256 * 1024;
function serializedLength(response) {
  try {
    return JSON.stringify(response)?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}
function createRelayOperationTable(options) {
  const records = /* @__PURE__ */ new Map();
  function prune() {
    const nowTs = options.now();
    for (const [key, record] of records) {
      if (record.state !== "pending" && nowTs - record.touchedAt > options.ttlMs) {
        records.delete(key);
      }
    }
    if (records.size > options.maxRecords) {
      for (const [key, record] of records) {
        if (records.size <= options.maxRecords) {
          break;
        }
        if (record.state !== "pending") {
          records.delete(key);
        }
      }
    }
  }
  return {
    get(key) {
      prune();
      return records.get(key) ?? null;
    },
    begin(key, wait) {
      prune();
      const record = {
        key,
        state: "pending",
        wait,
        response: null,
        delivered: false,
        address: null,
        touchedAt: options.now()
      };
      records.delete(key);
      records.set(key, record);
      return record;
    },
    markDelivered(key, address) {
      const record = records.get(key);
      if (record) {
        record.delivered = true;
        record.address = address ?? record.address;
      }
    },
    settle(key, state, response) {
      const record = records.get(key);
      if (!record) {
        return;
      }
      record.state = state;
      record.wait = null;
      record.touchedAt = options.now();
      record.response = state === "answered" && serializedLength(response) <= options.maxCachedChars ? response : null;
      records.delete(key);
      records.set(key, record);
      prune();
    },
    size() {
      prune();
      return records.size;
    }
  };
}

// src/dev/relayQueue.ts
var MAX_RELAY_PENDING_REQUESTS = 100;
var DEFAULT_RELAY_QUEUE_LIMITS = {
  maxInFlight: MAX_RELAY_PENDING_REQUESTS,
  maxPerOwner: 16,
  maxPerBoard: 48,
  maxBytes: 16 * 1024 * 1024
};
var RelayCapacityError = class extends Error {
  kind;
  limit;
  current;
  constructor(kind, limit, current) {
    super(kind === "in_flight" ? "Relay queue is full." : `Relay capacity reached (${kind}).`);
    this.name = "RelayCapacityError";
    this.kind = kind;
    this.limit = limit;
    this.current = current;
  }
};
var RelayTimeoutError = class extends Error {
  delivered;
  constructor(relayRequestId, delivered) {
    super(`Timed out waiting for Convyy dev bridge response for ${relayRequestId}.`);
    this.name = "RelayTimeoutError";
    this.delivered = delivered;
  }
};
var relayRequestCounter = 0;
function createRelayRequestId() {
  relayRequestCounter += 1;
  return `relay-request-${relayRequestCounter}`;
}
var MAX_RECENTLY_RESOLVED = 256;
var UNROUTED = { address: null, selector: { boardId: null, handle: null } };
function createRelayQueue(limitOverrides = {}) {
  const limits = { ...DEFAULT_RELAY_QUEUE_LIMITS, ...limitOverrides };
  const servedAt = /* @__PURE__ */ new Map();
  let serveCounter = 0;
  const pendingRequests = [];
  const inflightRequests = /* @__PURE__ */ new Map();
  const deferredById = /* @__PURE__ */ new Map();
  const recentlyResolved = /* @__PURE__ */ new Map();
  function rememberResolved(relayRequestId, assignee) {
    recentlyResolved.set(relayRequestId, assignee);
    if (recentlyResolved.size > MAX_RECENTLY_RESOLVED) {
      const oldest = recentlyResolved.keys().next().value;
      if (oldest !== void 0) {
        recentlyResolved.delete(oldest);
      }
    }
  }
  function removePendingRequest(relayRequestId) {
    const index = pendingRequests.findIndex((request) => request.relayRequestId === relayRequestId);
    if (index >= 0) {
      pendingRequests.splice(index, 1);
    }
  }
  function settle(relayRequestId, response) {
    const deferred = deferredById.get(relayRequestId);
    if (!deferred) {
      return false;
    }
    clearTimeout(deferred.timeoutId);
    deferredById.delete(relayRequestId);
    inflightRequests.delete(relayRequestId);
    removePendingRequest(relayRequestId);
    deferred.resolve(response);
    return true;
  }
  function occupying() {
    return [...pendingRequests, ...inflightRequests.values()];
  }
  function checkCapacity(route, owner, bytes) {
    const all = occupying();
    if (all.length >= limits.maxInFlight) {
      throw new RelayCapacityError("in_flight", limits.maxInFlight, all.length);
    }
    if (owner !== "") {
      const mine = all.filter((entry) => entry.owner === owner).length;
      if (mine >= limits.maxPerOwner) {
        throw new RelayCapacityError("owner", limits.maxPerOwner, mine);
      }
    }
    if (route.address !== null) {
      const onBoard = all.filter((entry) => entry.route.address === route.address).length;
      if (onBoard >= limits.maxPerBoard) {
        throw new RelayCapacityError("board", limits.maxPerBoard, onBoard);
      }
    }
    const usedBytes = all.reduce((sum, entry) => sum + entry.bytes, 0);
    if (usedBytes + bytes > limits.maxBytes) {
      throw new RelayCapacityError("bytes", limits.maxBytes, usedBytes);
    }
  }
  function pickFairly(accepts) {
    let best = -1;
    let bestServed = Number.POSITIVE_INFINITY;
    for (let index = 0; index < pendingRequests.length; index += 1) {
      const entry = pendingRequests[index];
      if (accepts && !accepts(entry.route, entry.message)) {
        continue;
      }
      const served = servedAt.get(entry.owner) ?? 0;
      if (served < bestServed) {
        best = index;
        bestServed = served;
      }
    }
    return best;
  }
  return {
    enqueue(message, timeoutMs = 15e3, route = UNROUTED, meta = {}) {
      const owner = meta.owner ?? "";
      const bytes = meta.bytes ?? 0;
      checkCapacity(route, owner, bytes);
      const relayRequestId = createRelayRequestId();
      const entry = {
        relayRequestId,
        message,
        route,
        assignee: null,
        deadlineAt: Date.now() + timeoutMs,
        owner,
        bytes,
        onDelivered: meta.onDelivered
      };
      pendingRequests.push(entry);
      return new Promise((resolve2, reject) => {
        const timeoutId = setTimeout(() => {
          const delivered = inflightRequests.has(relayRequestId);
          deferredById.delete(relayRequestId);
          inflightRequests.delete(relayRequestId);
          removePendingRequest(relayRequestId);
          reject(new RelayTimeoutError(relayRequestId, delivered));
        }, timeoutMs);
        deferredById.set(relayRequestId, { resolve: resolve2, reject, timeoutId });
      });
    },
    pull(accepts, assignee) {
      const index = pickFairly(accepts);
      if (index < 0) {
        return null;
      }
      const [entry] = pendingRequests.splice(index, 1);
      serveCounter += 1;
      servedAt.set(entry.owner, serveCounter);
      if (servedAt.size > 512) {
        const oldest = [...servedAt.entries()].sort((left, right) => left[1] - right[1]).slice(0, 256);
        oldest.forEach(([key]) => servedAt.delete(key));
      }
      entry.assignee = assignee ?? null;
      inflightRequests.set(entry.relayRequestId, entry);
      entry.onDelivered?.(entry.route.address);
      return { relayRequestId: entry.relayRequestId, message: entry.message, deadlineAt: entry.deadlineAt };
    },
    resolve(relayRequestId, response, assignee) {
      return this.resolveDetailed(relayRequestId, response, assignee) !== "rejected";
    },
    resolveDetailed(relayRequestId, response, assignee) {
      const inflight = inflightRequests.get(relayRequestId);
      if (assignee) {
        if (!inflight || !inflight.assignee || inflight.assignee.clientId !== assignee.clientId || inflight.assignee.epoch !== assignee.epoch) {
          const earlier = recentlyResolved.get(relayRequestId);
          return earlier && earlier.clientId === assignee.clientId && earlier.epoch === assignee.epoch ? "duplicate" : "rejected";
        }
      }
      const assigneeOfEntry = inflight?.assignee ?? null;
      if (!settle(relayRequestId, response)) {
        return "rejected";
      }
      rememberResolved(relayRequestId, assigneeOfEntry);
      return "accepted";
    },
    queued() {
      return pendingRequests.map((entry) => ({
        relayRequestId: entry.relayRequestId,
        message: entry.message,
        route: entry.route
      }));
    },
    setRouteAddress(relayRequestId, address) {
      const entry = pendingRequests.find((candidate) => candidate.relayRequestId === relayRequestId);
      if (entry) {
        entry.route = { ...entry.route, address };
      }
    },
    failQueued(matches, buildResponse) {
      const targets = pendingRequests.filter((entry) => matches(entry.route));
      for (const entry of targets) {
        settle(entry.relayRequestId, buildResponse(entry.message));
      }
      return targets.length;
    },
    failAssignedTo(clientId, buildResponse) {
      const targets = [...inflightRequests.values()].filter((entry) => entry.assignee?.clientId === clientId);
      for (const entry of targets) {
        settle(entry.relayRequestId, buildResponse(entry.message));
      }
      return targets.length;
    },
    pendingCount() {
      return pendingRequests.length;
    },
    runningCount() {
      return inflightRequests.size;
    },
    inFlightCount() {
      return pendingRequests.length + inflightRequests.size;
    },
    inFlightBytes() {
      return occupying().reduce((sum, entry) => sum + entry.bytes, 0);
    }
  };
}

// src/server/resultText.ts
var MAX_CHARS = 4e3;
var MAX_ITEMS = 60;
function isRecord(value) {
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
    const pages = structured.pages.filter(isRecord);
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
        const named = value.map((entry) => isRecord(entry) ? [str(entry.id), str(entry.name) ?? str(entry.title)].filter(Boolean).join(" ") : typeof entry === "string" ? entry : "").filter((entry) => entry !== "").slice(0, MAX_ITEMS);
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
  if (!isRecord(result) || Array.isArray(result.content)) {
    return response;
  }
  const structured = isRecord(result.structuredContent) ? result.structuredContent : null;
  const name = isRecord(request.params) && typeof request.params.name === "string" ? request.params.name : null;
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
var PayloadTooLargeError = class extends Error {
  constructor() {
    super("Payload too large.");
  }
};
function isRecord2(value) {
  return typeof value === "object" && value !== null;
}
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function parseJsonBody(rawBody) {
  if (!rawBody) {
    return null;
  }
  return JSON.parse(rawBody);
}
function isPayloadTooLargeError(error) {
  return error instanceof PayloadTooLargeError;
}
function readRequestBody(request) {
  return new Promise((resolve2, reject) => {
    let rawBody = "";
    let size = 0;
    let settled = false;
    request.setEncoding("utf8");
    const cleanup = () => {
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("error", onError);
    };
    const onData = (chunk) => {
      if (settled) {
        return;
      }
      size += Buffer.byteLength(chunk, "utf8");
      if (size > MAX_REQUEST_BODY_BYTES) {
        settled = true;
        cleanup();
        request.resume();
        reject(new PayloadTooLargeError());
        return;
      }
      rawBody += chunk;
    };
    const onEnd = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve2(rawBody);
    };
    const onError = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };
    request.on("data", onData);
    request.on("end", onEnd);
    request.on("error", onError);
  });
}
function buildCorsHeaders(origin) {
  if (!origin || !isAllowedRelayOrigin(origin)) {
    return {};
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type, X-Convyy-Relay-Client-Id, X-Convyy-Relay-Token",
    "Access-Control-Allow-Private-Network": "true"
  };
}
function writeJson(response, statusCode, payload, origin) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body, "utf8"),
    ...buildCorsHeaders(origin)
  });
  response.end(body);
}
function readHandshakeRequest(body) {
  if (!isRecord2(body) || !isNonEmptyString(body.protocolVersion) || !isNonEmptyString(body.clientId) || !isNonEmptyString(body.boardId) || !isNonEmptyString(body.nonce)) {
    return null;
  }
  return {
    protocolVersion: body.protocolVersion,
    clientId: body.clientId,
    boardId: body.boardId,
    nonce: body.nonce,
    profileId: isNonEmptyString(body.profileId) ? body.profileId.trim().slice(0, 128) : null,
    features: Array.isArray(body.features) ? body.features.filter((entry) => typeof entry === "string").slice(0, 16) : []
  };
}
function withExecutorRoute(message, boardId, epoch, deadlineAt) {
  const params = isRecord2(message.params) ? { ...message.params } : {};
  const context = isRecord2(params[CONVYY_TRUSTED_CONTEXT_PARAM]) ? params[CONVYY_TRUSTED_CONTEXT_PARAM] : null;
  if (context) {
    params[CONVYY_TRUSTED_CONTEXT_PARAM] = { ...context, route: { boardId, epoch, ...deadlineAt !== void 0 ? { deadlineAt } : {} } };
  }
  return { ...message, params };
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
  const direct = isRecord2(error) && typeof error.code === "string" ? error.code : null;
  const cause = isRecord2(error) && isRecord2(error.cause) && typeof error.cause.code === "string" ? error.cause.code : null;
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
  return isRecord2(data) && data.code === RELAY_ROUTING_CODES.UNKNOWN_CONNECTION;
}
function isUnknownOutcomeResponse(response) {
  const data = response?.error?.data;
  return response?.error?.code === CONVYY_RELAY_ROUTING_ERROR && isRecord2(data) && data.outcome === "unknown";
}
function createAgentChannel(host, port, timeoutMs, channelOptions = {}) {
  let connectionId;
  let connecting = null;
  const sleep = channelOptions.sleep ?? ((ms) => new Promise((resolve2) => setTimeout(resolve2, ms)));
  const maxAttempts = channelOptions.maxAttempts ?? 3;
  const retryDelayMs = channelOptions.retryDelayMs ?? 400;
  const recoveryDelayMs = channelOptions.recoveryDelayMs ?? 1500;
  const createOperationId = channelOptions.createOperationId ?? (() => `op-${randomUUID2()}`);
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
function sanitizeAgentLabel(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80);
  return trimmed.length > 0 ? trimmed : null;
}
function routingError(id, code, message, data = {}) {
  const outcome = code === RELAY_ROUTING_CODES.EXECUTOR_LOST || code === RELAY_ROUTING_CODES.OUTCOME_UNKNOWN ? "unknown" : "not_executed";
  return createJsonRpcError(id, CONVYY_RELAY_ROUTING_ERROR, message, { outcome, code, ...data });
}
function classifyOutcome(response) {
  const error = response?.error;
  if (!error) {
    return "answered";
  }
  const data = error.data;
  if (error.code === CONVYY_RELAY_ROUTING_ERROR && data) {
    return data.outcome === "unknown" ? "unknown" : "not_executed";
  }
  return "answered";
}
var BUSY_RETRY_AFTER_MS = 2e3;
function estimateRequestBytes(request) {
  try {
    return Buffer.byteLength(JSON.stringify(request), "utf8");
  } catch {
    return 0;
  }
}
function describeCapacity(error) {
  const reason = error.kind === "owner" ? `this agent already has ${error.current} calls in flight (limit ${error.limit})` : error.kind === "board" ? `this board already has ${error.current} calls in flight (limit ${error.limit})` : error.kind === "bytes" ? `the calls in flight already carry ${error.current} bytes (limit ${error.limit})` : `${error.current} calls are in flight (limit ${error.limit})`;
  return `The Convyy relay is busy: ${reason}. Nothing was executed; repeat the call in a few seconds.`;
}
function describeBoards(boards) {
  return boards.map((board) => ({ boardHandle: board.handle, boardId: board.boardId, origin: board.origin }));
}
function runConvyyMcpDevRelay(options = {}) {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4318;
  const requestTimeoutMs = options.requestTimeoutMs ?? 15e3;
  const sessionTtlMs = options.sessionTtlMs ?? 30 * 60 * 1e3;
  const maxSessions = options.maxSessions ?? 50;
  const executorLivenessMs = options.executorLivenessMs ?? 6e4;
  const maxAgentConnections = options.maxAgentConnections ?? 500;
  const now = options.now ?? Date.now;
  const shutdownOnStdinClose = options.shutdownOnStdinClose ?? true;
  const daemon = options.daemon ?? false;
  const idleExitMs = options.idleExitMs ?? 0;
  const drainTimeoutMs = options.drainTimeoutMs ?? 3e4;
  const startedAt = now();
  let lastActivityAt = startedAt;
  let draining = false;
  let shuttingDown = false;
  const lifecycleTimers = /* @__PURE__ */ new Set();
  function touchActivity() {
    lastActivityAt = now();
  }
  const relayQueue = createRelayQueue(options.queueLimits);
  const operationTable = createRelayOperationTable({
    now,
    ttlMs: DEFAULT_OPERATION_TTL_MS,
    maxRecords: DEFAULT_MAX_OPERATION_RECORDS,
    maxCachedChars: DEFAULT_MAX_CACHED_ANSWER_CHARS,
    ...options.operationTable
  });
  const boardRegistry = createBoardRegistry({ now, livenessMs: executorLivenessMs });
  const relayInstanceId = randomUUID2();
  const browserSessions = /* @__PURE__ */ new Map();
  const agentConnections = /* @__PURE__ */ new Map();
  const tokenPath = getRelayAgentTokenPath(port);
  function failExecutorWork(clientId, code, message) {
    relayQueue.failAssignedTo(
      clientId,
      (request) => routingError(request.id ?? null, code, message, { outcome: "unknown" })
    );
  }
  function dropBrowserSession(clientId, reason) {
    browserSessions.delete(clientId);
    boardRegistry.release(clientId);
    failExecutorWork(
      clientId,
      RELAY_ROUTING_CODES.EXECUTOR_LOST,
      `The board executor went away (${reason}) before answering; the outcome of this request is unknown.`
    );
  }
  function pruneExpiredBrowserSessions(nowTs) {
    for (const [clientId, session] of browserSessions.entries()) {
      if (session.expiresAt <= nowTs) {
        dropBrowserSession(clientId, "expired");
      }
    }
  }
  function evictOldestBrowserSession() {
    let oldestClientId = null;
    let oldestExpiresAt = Number.POSITIVE_INFINITY;
    for (const [clientId, session] of browserSessions.entries()) {
      if (session.expiresAt < oldestExpiresAt) {
        oldestExpiresAt = session.expiresAt;
        oldestClientId = clientId;
      }
    }
    if (oldestClientId) {
      dropBrowserSession(oldestClientId, "evicted");
    }
  }
  function issueAgentConnection(agent) {
    if (agentConnections.size >= maxAgentConnections) {
      const oldest = agentConnections.keys().next().value;
      if (oldest !== void 0) {
        agentConnections.delete(oldest);
      }
    }
    const connection = { connectionId: `conn-${randomUUID2()}`, agent, lastSeenAt: now() };
    agentConnections.set(connection.connectionId, connection);
    return connection;
  }
  function resolveAgentConnection(connectionIdHeader) {
    const known = connectionIdHeader ? agentConnections.get(connectionIdHeader) : void 0;
    if (known) {
      known.lastSeenAt = now();
    }
    return known ?? null;
  }
  function stampRequest(request, connection, operation) {
    const params = isRecord2(request.params) ? { ...request.params } : {};
    delete params[CONVYY_TRUSTED_CONTEXT_PARAM];
    const context = {
      version: CONVYY_TRUSTED_CONTEXT_VERSION,
      connectionId: connection.connectionId,
      agent: connection.agent,
      ...operation ? { operationId: operation.operationId, ...operation.replay ? { replay: true } : {} } : {}
    };
    params[CONVYY_TRUSTED_CONTEXT_PARAM] = context;
    return { ...request, params };
  }
  function readTargetSelector(request) {
    const params = isRecord2(request.params) ? request.params : {};
    const args = isRecord2(params.arguments) ? params.arguments : {};
    return {
      boardId: isNonEmptyString(args.boardId) ? args.boardId.trim() : null,
      handle: isNonEmptyString(args.boardHandle) ? args.boardHandle.trim() : null
    };
  }
  function routeRequest(request) {
    const id = request.id ?? null;
    const selector = readTargetSelector(request);
    const live = boardRegistry.liveBoards();
    if (selector.handle) {
      const board = boardRegistry.findByHandle(selector.handle);
      if (!board || !live.includes(board)) {
        return {
          response: routingError(
            id,
            RELAY_ROUTING_CODES.BOARD_NOT_FOUND,
            `The requested board is not available (closed, switched off or the handle is stale). Available boards: ${JSON.stringify(describeBoards(live))}.`,
            { boards: describeBoards(live) }
          )
        };
      }
      return { route: { address: board.address, selector } };
    }
    const candidates = selector.boardId ? live.filter((board) => board.boardId === selector.boardId) : live;
    if (candidates.length === 1) {
      return { route: { address: candidates[0].address, selector } };
    }
    if (candidates.length === 0 && live.length === 1) {
      return { route: { address: live[0].address, selector } };
    }
    const ambiguous = candidates.length > 1 ? candidates : live;
    if (ambiguous.length > 1) {
      return {
        response: routingError(
          id,
          RELAY_ROUTING_CODES.BOARD_TARGET_REQUIRED,
          `Several Convyy boards are open. Repeat the call with boardHandle set to one of: ${JSON.stringify(describeBoards(ambiguous))}. Nothing was executed.`,
          { boards: describeBoards(ambiguous) }
        )
      };
    }
    const off = boardRegistry.offBoards().filter((board) => !selector.boardId || board.boardId === selector.boardId);
    if (live.length === 0 && off.length > 0) {
      return {
        response: routingError(
          id,
          RELAY_ROUTING_CODES.BOARD_OFF,
          "Access to the Convyy board is switched off in the browser. Nothing was executed."
        )
      };
    }
    return { route: { address: null, selector } };
  }
  function settleUnroutedRequests() {
    const live = boardRegistry.liveBoards();
    for (const queued of relayQueue.queued()) {
      if (queued.route.address !== null) {
        continue;
      }
      const { boardId } = queued.route.selector;
      let candidates = boardId ? live.filter((board) => board.boardId === boardId) : live;
      if (candidates.length === 0 && live.length === 1) {
        candidates = live;
      }
      if (candidates.length === 1) {
        relayQueue.setRouteAddress(queued.relayRequestId, candidates[0].address);
      } else if (candidates.length > 1) {
        relayQueue.failQueued(
          (route) => route === queued.route,
          (message) => routingError(
            message.id ?? null,
            RELAY_ROUTING_CODES.BOARD_TARGET_REQUIRED,
            `Several Convyy boards are open. Repeat the call with boardHandle set to one of: ${JSON.stringify(describeBoards(candidates))}. Nothing was executed.`,
            { boards: describeBoards(candidates) }
          )
        );
      }
    }
  }
  async function enqueueForBoard(request, stamped, route, owner, onDelivered) {
    try {
      return await relayQueue.enqueue(stamped, requestTimeoutMs, route, {
        owner,
        bytes: estimateRequestBytes(stamped),
        onDelivered
      });
    } catch (error) {
      if (error instanceof RelayCapacityError) {
        return routingError(
          request.id ?? null,
          RELAY_ROUTING_CODES.BUSY,
          describeCapacity(error),
          {
            outcome: "not_executed",
            limit: error.kind,
            max: error.limit,
            inFlight: relayQueue.inFlightCount(),
            retryAfterMs: BUSY_RETRY_AFTER_MS
          }
        );
      }
      if (error instanceof RelayTimeoutError) {
        return error.delivered ? routingError(
          request.id ?? null,
          RELAY_ROUTING_CODES.OUTCOME_UNKNOWN,
          "The board did not answer in time after taking the request. It may or may not have been applied: check the board before repeating the call.",
          { outcome: "unknown" }
        ) : routingError(
          request.id ?? null,
          RELAY_ROUTING_CODES.TIMEOUT,
          "No Convyy board picked the request up in time: is the board open in a browser tab, and switched on? Nothing was executed.",
          { outcome: "not_executed" }
        );
      }
      throw error;
    }
  }
  function withResponseId(response, id) {
    return response ? { ...response, id } : response;
  }
  async function submitAgentRequest(request, connectionIdHeader, operation) {
    const connection = resolveAgentConnection(connectionIdHeader);
    if (!connection) {
      return routingError(
        request.id ?? null,
        RELAY_ROUTING_CODES.UNKNOWN_CONNECTION,
        connectionIdHeader ? "Unknown agent connection. Reconnect to the relay and repeat the call." : "The call carries no relay connection. Register with the relay (POST /agent/connect) first; an outdated Convyy connector must be updated."
      );
    }
    const owner = connection.connectionId;
    const id = request.id ?? null;
    if (draining) {
      return routingError(
        id,
        RELAY_ROUTING_CODES.DRAINING,
        "The Convyy relay is restarting for an update. Nothing was executed; repeat the call in a moment.",
        { outcome: "not_executed", retryAfterMs: BUSY_RETRY_AFTER_MS }
      );
    }
    if (!operation || request.method !== "tools/call") {
      const stamped2 = stampRequest(request, connection);
      const decision = routeRequest(stamped2);
      return "response" in decision ? decision.response : enqueueForBoard(request, stamped2, decision.route, owner);
    }
    const key = `${owner}\0${operation.id}`;
    const known = operationTable.get(key);
    if (known) {
      if (known.state === "pending" && known.wait) {
        return withResponseId(await known.wait, id);
      }
      if (known.state === "answered") {
        if (known.response) {
          return withResponseId(known.response, id);
        }
        return routingError(
          id,
          RELAY_ROUTING_CODES.OUTCOME_UNKNOWN,
          "The call was answered, but its answer was too large to keep. Check the board before repeating the call."
        );
      }
    }
    const replay = known?.state === "unknown" || operation.attempt > 1;
    const stamped = stampRequest(request, connection, { operationId: operation.id, replay });
    let route;
    if (replay && known?.address && boardRegistry.findByAddress(known.address)?.off) {
      return routingError(
        id,
        RELAY_ROUTING_CODES.BOARD_OFF,
        "Access to the board is switched off, so the outcome of the earlier attempt cannot be checked. If it had already been committed it stays on the board.",
        { outcome: "unknown" }
      );
    }
    if (replay && known?.address) {
      route = { address: known.address, selector: readTargetSelector(stamped) };
    } else {
      const decision = routeRequest(stamped);
      if ("response" in decision) {
        return replay ? replayCouldNotCheck(id) : decision.response;
      }
      route = decision.route;
    }
    const wait = enqueueForBoard(request, stamped, route, owner, (address) => operationTable.markDelivered(key, address)).then((response) => {
      const outcome = classifyOutcome(response);
      if (replay && outcome === "not_executed") {
        operationTable.settle(key, "unknown", null);
        return replayCouldNotCheck(id);
      }
      operationTable.settle(key, outcome, response);
      return response;
    }, (error) => {
      operationTable.settle(key, replay ? "unknown" : "not_executed", null);
      throw error;
    });
    operationTable.begin(key, wait);
    return wait;
  }
  function replayCouldNotCheck(id) {
    return routingError(
      id,
      RELAY_ROUTING_CODES.OUTCOME_UNKNOWN,
      "An earlier attempt of this call may have been applied and the board could not be reached to check. Look at the board before repeating the call.",
      { outcome: "unknown" }
    );
  }
  const proc = globalThis.process;
  let isOwner = false;
  let agentToken = null;
  let ownConnection = null;
  const server = http.createServer(async (request, response) => {
    if (!request.url || !request.method) {
      writeJson(response, 404, { error: "Not found" });
      return;
    }
    const origin = typeof request.headers.origin === "string" ? request.headers.origin : void 0;
    if (!isAllowedRelayOrigin(origin)) {
      writeJson(response, 403, { ok: false, error: "Origin not allowed." });
      return;
    }
    const hostHeader = typeof request.headers.host === "string" ? request.headers.host : void 0;
    if (!isAllowedRelayHost(hostHeader)) {
      writeJson(response, 403, {
        ok: false,
        error: `Host not allowed. Expected one of: ${CONVYY_RELAY_ALLOWED_HOSTS.join(", ")}.`
      }, origin);
      return;
    }
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        ...buildCorsHeaders(origin),
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        // Chrome's Private Network Access requires this on the preflight when a
        // public HTTPS origin (the hosted board) calls a loopback relay.
        "Access-Control-Max-Age": "86400"
      });
      response.end();
      return;
    }
    if (request.method === "GET" && request.url === "/health") {
      writeJson(response, 200, {
        ok: true,
        protocolVersion: CONVYY_RELAY_PROTOCOL_VERSION,
        instanceId: relayInstanceId,
        version: CONVYY_RELAY_VERSION,
        revision: CONVYY_RELAY_REVISION,
        capabilities: CONVYY_RELAY_CAPABILITIES,
        pid: proc?.pid ?? null,
        startedAt,
        draining,
        idleExitMs,
        tokenWatchMs: options.tokenWatchMs ?? 0,
        handshakeRequired: true,
        pendingCount: relayQueue.pendingCount(),
        runningCount: relayQueue.runningCount(),
        inFlightBytes: relayQueue.inFlightBytes()
      }, origin);
      return;
    }
    if (request.method === "POST" && request.url === "/browser/handshake") {
      try {
        const handshake = readHandshakeRequest(parseJsonBody(await readRequestBody(request)));
        if (!handshake || handshake.protocolVersion !== CONVYY_RELAY_PROTOCOL_VERSION) {
          writeJson(response, 400, { ok: false, error: "Invalid relay handshake request." }, origin);
          return;
        }
        const nowTs = now();
        touchActivity();
        pruneExpiredBrowserSessions(nowTs);
        if (browserSessions.size >= maxSessions) {
          evictOldestBrowserSession();
        }
        const { record, previousOwnerClientId } = boardRegistry.register({
          origin: origin ?? "no-origin",
          profileId: handshake.profileId ?? "unknown-profile",
          boardId: handshake.boardId
        }, handshake.clientId);
        if (previousOwnerClientId) {
          failExecutorWork(
            previousOwnerClientId,
            RELAY_ROUTING_CODES.EXECUTOR_LOST,
            "Another browser tab took over this board before the request was answered; the outcome is unknown."
          );
        }
        const sessionToken = randomUUID2();
        browserSessions.set(handshake.clientId, {
          boardId: handshake.boardId,
          address: record.address,
          epoch: record.epoch,
          supportsOperations: handshake.features.includes("operations"),
          sessionToken,
          expiresAt: nowTs + sessionTtlMs
        });
        const payload = {
          ok: true,
          protocolVersion: CONVYY_RELAY_PROTOCOL_VERSION,
          instanceId: relayInstanceId,
          clientId: handshake.clientId,
          boardId: handshake.boardId,
          nonce: handshake.nonce,
          sessionToken,
          epoch: record.epoch,
          boardsAvailable: boardRegistry.liveBoards().length
        };
        writeJson(response, 200, payload, origin);
      } catch (error) {
        if (isPayloadTooLargeError(error)) {
          writeJson(response, 413, { ok: false, error: error.message }, origin);
          return;
        }
        writeJson(response, 500, {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown relay handshake error."
        }, origin);
      }
      return;
    }
    const authenticatedBrowserSession = (() => {
      const clientId = request.headers[CONVYY_RELAY_CLIENT_ID_HEADER];
      const sessionToken = request.headers[CONVYY_RELAY_TOKEN_HEADER];
      if (typeof clientId !== "string" || typeof sessionToken !== "string") {
        return null;
      }
      const session = browserSessions.get(clientId);
      if (!session) {
        return null;
      }
      if (session.expiresAt <= now()) {
        dropBrowserSession(clientId, "expired");
        return null;
      }
      if (session.sessionToken !== sessionToken) {
        return null;
      }
      session.expiresAt = now() + sessionTtlMs;
      touchActivity();
      return {
        clientId,
        boardId: session.boardId,
        address: session.address,
        epoch: session.epoch,
        supportsOperations: session.supportsOperations
      };
    })();
    if (request.method === "GET" && request.url === "/browser/pull") {
      if (!authenticatedBrowserSession) {
        writeJson(response, 403, { ok: false, error: "Relay handshake required." }, origin);
        return;
      }
      const { clientId, address, epoch, boardId, supportsOperations } = authenticatedBrowserSession;
      if (!boardRegistry.isCurrentOwner(address, clientId, epoch)) {
        writeJson(response, 409, {
          ok: false,
          error: "This tab no longer executes the board.",
          code: "superseded"
        }, origin);
        return;
      }
      boardRegistry.touch(clientId);
      settleUnroutedRequests();
      const pulled = relayQueue.pull((route, message) => {
        if (route.address !== address) {
          return false;
        }
        const params = isRecord2(message.params) ? message.params : {};
        const context = params[CONVYY_TRUSTED_CONTEXT_PARAM];
        return supportsOperations || !(isRecord2(context) && context.replay === true);
      }, { clientId, epoch });
      const payload = {
        request: pulled ? {
          relayRequestId: pulled.relayRequestId,
          message: withExecutorRoute(pulled.message, boardId, epoch, pulled.deadlineAt),
          deadlineAt: pulled.deadlineAt
        } : null,
        epoch,
        boardsAvailable: boardRegistry.liveBoards().length
      };
      writeJson(response, 200, payload, origin);
      return;
    }
    if (request.method === "POST" && request.url === "/browser/push") {
      if (!authenticatedBrowserSession) {
        writeJson(response, 403, { ok: false, error: "Relay handshake required." }, origin);
        return;
      }
      try {
        const body = parseJsonBody(await readRequestBody(request));
        if (!isRecord2(body) || typeof body.relayRequestId !== "string") {
          writeJson(response, 400, { ok: false, error: "Invalid relay push body." }, origin);
          return;
        }
        const { clientId, address, epoch } = authenticatedBrowserSession;
        if (!boardRegistry.isCurrentOwner(address, clientId, epoch)) {
          writeJson(response, 409, {
            ok: false,
            error: "This tab no longer executes the board.",
            code: "superseded"
          }, origin);
          return;
        }
        const accepted = relayQueue.resolveDetailed(
          body.relayRequestId,
          body.response ?? null,
          { clientId, epoch }
        );
        const reply = accepted === "rejected" ? { ok: false } : accepted === "duplicate" ? { ok: true, duplicate: true } : { ok: true };
        writeJson(response, 200, reply, origin);
      } catch (error) {
        if (isPayloadTooLargeError(error)) {
          writeJson(response, 413, { ok: false, error: error.message }, origin);
          return;
        }
        writeJson(response, 500, {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown bridge push error."
        }, origin);
      }
      return;
    }
    if (request.method === "POST" && request.url === "/browser/disconnect") {
      if (!authenticatedBrowserSession) {
        writeJson(response, 403, { ok: false, error: "Relay handshake required." }, origin);
        return;
      }
      try {
        const body = parseJsonBody(await readRequestBody(request));
        const reason = isRecord2(body) && body.reason === "off" ? "off" : "closed";
        const { clientId, address } = authenticatedBrowserSession;
        const wasOwner = boardRegistry.release(clientId, reason) !== null;
        browserSessions.delete(clientId);
        if (wasOwner) {
          failExecutorWork(
            clientId,
            reason === "off" ? RELAY_ROUTING_CODES.BOARD_OFF : RELAY_ROUTING_CODES.EXECUTOR_LOST,
            reason === "off" ? "Access to this board was switched off while the request was running. If it was already committed it stays on the board." : "The board was closed before the request was answered; the outcome is unknown."
          );
          if (reason === "off") {
            relayQueue.failQueued(
              (route) => route.address === address,
              (message) => routingError(
                message.id ?? null,
                RELAY_ROUTING_CODES.BOARD_OFF,
                "Access to this board is switched off. Nothing was executed."
              )
            );
          }
        }
        writeJson(response, 200, { ok: true }, origin);
      } catch (error) {
        writeJson(response, error instanceof SyntaxError ? 400 : 500, {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown relay disconnect error."
        }, origin);
      }
      return;
    }
    if (request.url === "/agent/connect" || request.url === "/agent/request" || request.url === "/agent/heartbeat" || request.url === "/admin/drain") {
      if (request.method !== "POST" || !agentToken || request.headers[CONVYY_RELAY_AGENT_TOKEN_HEADER] !== agentToken) {
        writeJson(response, request.method === "POST" ? 403 : 404, request.method === "POST" ? { ok: false, error: "Agent token required." } : { error: "Not found" }, origin);
        return;
      }
    }
    if (request.url === "/agent/connect" || request.url === "/agent/request" || request.url === "/agent/heartbeat") {
      touchActivity();
    }
    if (request.method === "POST" && request.url === "/agent/heartbeat") {
      try {
        const body = parseJsonBody(await readRequestBody(request));
        const known = isRecord2(body) && typeof body.connectionId === "string" ? agentConnections.get(body.connectionId) : void 0;
        if (!known) {
          writeJson(response, 200, { ok: false, code: RELAY_ROUTING_CODES.UNKNOWN_CONNECTION }, origin);
          return;
        }
        known.lastSeenAt = now();
        writeJson(response, 200, { ok: true, draining }, origin);
      } catch (error) {
        writeJson(response, 400, { ok: false, error: error instanceof Error ? error.message : "Invalid heartbeat." }, origin);
      }
      return;
    }
    if (request.method === "POST" && request.url === "/admin/drain") {
      beginDrain();
      writeJson(response, 200, { ok: true, inFlight: relayQueue.inFlightCount() }, origin);
      return;
    }
    if (request.method === "POST" && request.url === "/agent/connect") {
      if (draining) {
        writeJson(response, 503, { ok: false, code: RELAY_ROUTING_CODES.DRAINING }, origin);
        return;
      }
      try {
        const body = parseJsonBody(await readRequestBody(request));
        const agent = isRecord2(body) ? sanitizeAgentLabel(body.agent) : null;
        const connection = issueAgentConnection(agent);
        writeJson(response, 200, { ok: true, connectionId: connection.connectionId }, origin);
      } catch (error) {
        writeJson(response, isPayloadTooLargeError(error) ? 413 : 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Invalid connect request."
        }, origin);
      }
      return;
    }
    if (request.method === "POST" && request.url === "/agent/request") {
      try {
        const body = parseJsonBody(await readRequestBody(request));
        if (!isRecord2(body) || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
          writeJson(response, 400, { ok: false, error: "Invalid agent request body." }, origin);
          return;
        }
        const connectionHeader = request.headers[CONVYY_RELAY_CONNECTION_ID_HEADER];
        const operationHeader = request.headers[CONVYY_RELAY_OPERATION_ID_HEADER];
        const attemptHeader = Number.parseInt(String(request.headers[CONVYY_RELAY_ATTEMPT_HEADER] ?? "1"), 10);
        const result = await submitAgentRequest(
          body,
          typeof connectionHeader === "string" ? connectionHeader : void 0,
          isValidOperationId(operationHeader) ? { id: operationHeader, attempt: Number.isFinite(attemptHeader) && attemptHeader > 0 ? attemptHeader : 1 } : void 0
        );
        writeJson(response, 200, { ok: true, response: result }, origin);
      } catch (error) {
        if (isPayloadTooLargeError(error)) {
          writeJson(response, 413, { ok: false, error: error.message }, origin);
          return;
        }
        writeJson(response, 200, {
          ok: false,
          error: error instanceof Error ? error.message : "Convyy relay failed to route the agent request."
        }, origin);
      }
      return;
    }
    writeJson(response, 404, { error: "Not found" }, origin);
  });
  function attachStdioBridge(dispatch) {
    let displayName = null;
    createStdioMessageReader(async (payload) => {
      if (!isRecord2(payload) || payload.jsonrpc !== "2.0" || typeof payload.method !== "string") {
        writeFramedJsonRpcMessage(createJsonRpcError(null, -32600, "Invalid Request"));
        return;
      }
      const request = payload;
      if (request.method === "initialize") {
        const clientInfo = isRecord2(request.params) && isRecord2(request.params.clientInfo) ? request.params.clientInfo : null;
        displayName = sanitizeAgentLabel(clientInfo?.name);
        ownConnection = isOwner ? issueAgentConnection(displayName) : null;
        writeFramedJsonRpcMessage(createJsonRpcResult(request.id ?? null, {
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
        }));
        return;
      }
      if (request.method === "ping") {
        writeFramedJsonRpcMessage(createJsonRpcResult(request.id ?? null, {}));
        return;
      }
      if (request.method === "notifications/initialized") {
        return;
      }
      if (request.method === "tools/list") {
        writeFramedJsonRpcMessage(createJsonRpcResult(request.id ?? null, {
          tools: buildMcpToolsList()
        }));
        return;
      }
      try {
        const result = await dispatch(request, displayName);
        if (result) {
          writeFramedJsonRpcMessage(ensureToolResultContent(request, result));
        }
      } catch (error) {
        writeFramedJsonRpcMessage(
          createJsonRpcError(
            request.id ?? null,
            -32e3,
            error instanceof Error ? error.message : "Convyy dev bridge relay failed."
          )
        );
      }
    });
  }
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      if (daemon) {
        proc?.stderr?.write(`Convyy MCP relay ${host}:${port} is already taken; exiting.
`);
        finish("port-in-use");
        return;
      }
      proc?.stderr?.write(
        `Convyy MCP relay ${host}:${port} is already running; attaching to it as a client.
`
      );
      const channel = createAgentChannel(host, port, requestTimeoutMs);
      attachStdioBridge(async (request, agent) => {
        await channel.connect(agent);
        return channel.forward(request);
      });
      return;
    }
    proc?.stderr?.write(`Convyy MCP relay failed to start: ${error.message}
`);
    proc?.exit(1);
  });
  server.on("listening", () => {
    isOwner = true;
    agentToken = randomUUID2();
    try {
      writeRelayAgentTokenFile(port, agentToken);
    } catch (error) {
      proc?.stderr?.write(`Convyy MCP relay cannot store its token: ${error instanceof Error ? error.message : "unknown error"}
`);
      isOwner = false;
      agentToken = null;
      server.close();
      proc?.exit(1);
      return;
    }
    startLifecycleWatch();
    if (daemon) {
      return;
    }
    attachStdioBridge((request) => submitAgentRequest(request, ownConnection?.connectionId));
  });
  function cleanupAgentTokenFile() {
    if (!isOwner || agentToken === null) {
      return;
    }
    try {
      if (fs2.readFileSync(tokenPath, "utf8").trim() === agentToken) {
        fs2.rmSync(tokenPath, { force: true });
      }
    } catch {
    }
    agentToken = null;
  }
  server.on("close", cleanupAgentTokenFile);
  function finish(reason) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    lifecycleTimers.forEach((timer) => clearInterval(timer));
    lifecycleTimers.clear();
    relayQueue.failQueued(
      () => true,
      (message) => routingError(
        message.id ?? null,
        RELAY_ROUTING_CODES.DRAINING,
        "The Convyy relay stopped before the request reached a board. Nothing was executed."
      )
    );
    cleanupAgentTokenFile();
    server.close();
    server.closeAllConnections?.();
    if (options.onShutdown) {
      options.onShutdown(reason);
    } else if (daemon) {
      proc?.exit(0);
    }
  }
  function beginDrain() {
    if (draining || shuttingDown) {
      return;
    }
    draining = true;
    const deadline = now() + drainTimeoutMs;
    const timer = setInterval(() => {
      if (relayQueue.inFlightCount() === 0 || now() >= deadline) {
        finish("drained");
      }
    }, 50);
    timer.unref?.();
    lifecycleTimers.add(timer);
  }
  function isIdle() {
    const nowTs = now();
    if (idleExitMs <= 0 || relayQueue.inFlightCount() > 0) {
      return false;
    }
    if (nowTs - lastActivityAt < idleExitMs) {
      return false;
    }
    return true;
  }
  function startLifecycleWatch() {
    if (idleExitMs > 0) {
      const every = options.idleCheckMs ?? Math.max(20, Math.min(15e3, Math.floor(idleExitMs / 4)));
      const timer = setInterval(() => {
        if (isIdle()) {
          proc?.stderr?.write("Convyy MCP relay: no clients for a while; exiting.\n");
          finish("idle");
        }
      }, every);
      timer.unref?.();
      lifecycleTimers.add(timer);
    }
    if (options.tokenWatchMs && options.tokenWatchMs > 0) {
      const timer = setInterval(() => {
        let valid = false;
        try {
          valid = agentToken !== null && fs2.readFileSync(tokenPath, "utf8").trim() === agentToken;
        } catch {
          valid = false;
        }
        if (!valid) {
          proc?.stderr?.write("Convyy MCP relay: token file lost; exiting so a fresh relay can start.\n");
          finish("token-lost");
        }
      }, options.tokenWatchMs);
      timer.unref?.();
      lifecycleTimers.add(timer);
    }
  }
  function shutdown() {
    if (isOwner) {
      server.close();
      cleanupAgentTokenFile();
    }
    proc?.exit(0);
  }
  if (shutdownOnStdinClose && !daemon) {
    proc?.stdin?.on("end", shutdown);
    proc?.stdin?.on("close", shutdown);
  }
  server.listen(port, host);
  return server;
}

// src/dev/devRelayCli.ts
var nodeProcess2 = globalThis;
function getArgValue(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }
  return args[index + 1] ?? null;
}
function runDevRelayCli(args) {
  if (args.includes("--help")) {
    nodeProcess2.process?.stdout.write(
      "Usage: convyy-mcp-dev [--host 127.0.0.1] [--port 4318] [--timeout 15000] [--idle-exit-ms 600000] [--token-watch-ms 5000]\n"
    );
    return 0;
  }
  const host = getArgValue(args, "--host") ?? "127.0.0.1";
  const port = Number.parseInt(getArgValue(args, "--port") ?? "4318", 10);
  const timeoutMs = Number.parseInt(getArgValue(args, "--timeout") ?? "15000", 10);
  const idleExitMs = Number.parseInt(getArgValue(args, "--idle-exit-ms") ?? "", 10);
  const tokenWatchMs = Number.parseInt(getArgValue(args, "--token-watch-ms") ?? "", 10);
  runConvyyMcpDevRelay({
    host,
    port: Number.isFinite(port) ? port : 4318,
    requestTimeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 15e3,
    shutdownOnStdinClose: false,
    daemon: true,
    idleExitMs: Number.isFinite(idleExitMs) ? idleExitMs : CONVYY_RELAY_DEFAULT_IDLE_EXIT_MS,
    tokenWatchMs: Number.isFinite(tokenWatchMs) ? tokenWatchMs : CONVYY_RELAY_DEFAULT_TOKEN_WATCH_MS
  });
  nodeProcess2.process?.stdout.write(
    `Convyy MCP dev relay is listening on http://${host}:${Number.isFinite(port) ? port : 4318}
`
  );
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
  const exitCode = runDevRelayCli(nodeProcess2.process?.argv.slice(2) ?? []);
  if (typeof exitCode === "number") {
    nodeProcess2.process?.exit(exitCode);
  }
}
export {
  runDevRelayCli
};
