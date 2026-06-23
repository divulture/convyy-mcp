# Convyy MCP

A standalone stdio MCP server that lets an AI agent (Codex, Claude, Cursor, Cline, etc.) work
with an **already open Convyy board**: draw on the canvas, apply templates, manage pages, read
content, and revert its own actions.

---

## 1. What this is

`Convyy MCP` is a bridge between an AI agent and a live Convyy board. The agent doesn't just
produce text — it calls tools, and the result **appears on the canvas**.

Core principle: **the model owns the content and the structure, the server owns layout and
style.** The server never invents content from a fixed template — it lays out exactly what the
agent sends and styles it to match the board.

### How it works

By default the server starts in **relay mode**:

1. the MCP client (Codex/Claude) talks to `convyy-mcp` over stdio;
2. `convyy-mcp` exposes its tools immediately via `tools/list`;
3. the Convyy board open in the browser connects to the local relay at `http://127.0.0.1:4318`;
4. tool calls are forwarded into the board runtime and committed onto the canvas.

To actually draw anything you need **both halves**: an open board in the browser **and**
`Convyy MCP` connected in the agent. The `--local` flag is for debugging only.

Note: these are **MCP tools, not slash commands.** The correct protocol is
`initialize → tools/list → tools/call`. Don't type `/convyy_draw` into the client's input box.

---

## 2. Installation

```bash
git clone https://github.com/divulture/convyy-mcp.git
cd convyy-mcp
npm install
npm run build
```

Verify the build:

```bash
npm run typecheck   # types
npm run test        # unit tests
npm run smoke       # stdio boot/handshake check
```

`npm run smoke` confirms the server starts and answers the handshake. It does **not** prove that
the browser board is already attached to the relay.

After building, two binaries are available:

- `convyy-mcp` → `dist/server.js` (the MCP server);
- `convyy-mcp-dev` → `dist/dev/devRelayCli.js` (dev relay CLI).

---

## 3. Connecting it to your agent

Connect it like any other stdio MCP server. Point it at `dist/server.js` or the `convyy-mcp`
binary.

### Claude (Desktop / Claude Code)

Claude Code (CLI):

```bash
claude mcp add convyy -- node /absolute/path/convyy-mcp/dist/server.js
```

Or manually in `claude_desktop_config.json` (Claude Desktop):

```json
{
  "mcpServers": {
    "convyy": {
      "command": "node",
      "args": ["/absolute/path/convyy-mcp/dist/server.js"]
    }
  }
}
```

### Codex

In `~/.codex/config.toml`:

```toml
[mcp_servers.convyy]
command = "node"
args = ["/absolute/path/convyy-mcp/dist/server.js"]
```

### If the binary is on your PATH

If the package is installed globally or linked (`npm link`), it's simpler:

```json
{
  "mcpServers": {
    "convyy": { "command": "convyy-mcp", "args": [] }
  }
}
```

### After connecting

1. restart/reconnect the MCP client;
2. confirm `tools/list` exposes the `convyy_*` tools;
3. open a Convyy board in the browser and check the relay reaches `healthy`;
4. give the agent a task — the result appears on the canvas.

---

## 4. Available tools

Five tools with clear boundaries: four write tools (`draw`, `apply_template`, `pages`,
`revert`) and one read tool (`analyze`).

### `convyy_draw` — draw anything

The universal tool. The agent sends an array of `elements` built from native board primitives;
the server lays them out as canvas objects.

Supported elements:
- `shape` — a shape (process, decision, terminator, rectangle, ellipse… the flowchart set);
- `sticky` — a sticky note (with a colour);
- `frame` — a container frame;
- `text` — a text block;
- `connector` — a link between elements (`from`/`to` by id).

An optional `layout` hint (`free` | `flow-lr` | `grid`) lets the agent skip coordinates and have
the server place elements. This is the escape hatch for anything that doesn't fit a template
(custom diagrams, sticky sets, flows, summaries).

### `convyy_apply_template` — adaptive named template

Recurring business artefacts with a tuned layout and style. The agent provides a `templateId`
and a `structure` (lanes and stages of **any size**); the server builds the grid and **grows it**
to fit the content, inheriting the preset style. Content is never truncated.

Available `templateId`s:
- `cjm` — customer journey map (default lanes: actions/pains/opportunities; add your own);
- `swot` — SWOT analysis;
- `raci` — RACI matrix (roles × tasks);
- `retro` — retrospective board;
- `bmc` — Business Model Canvas;
- `kanban` — kanban board (rendered as a native kanban frame).

Calling with `{ "list": true }` returns the available templates and their `structure` shape
without committing anything.

### `convyy_pages` — page management

`action`:
- `list` — pages + active page + session binding;
- `create` — create a page (`name`) and make it active;
- `switch` — switch to a page (`pageId`).

### `convyy_analyze` — read the canvas (read-only)

`scope`:
- `image` — analyze the images on the page;
- `page` — text summary of the whole page;
- `selection` — summary of the selection (falls back to the whole page if unavailable).

Returns a text summary and changes nothing on the board.

### `convyy_revert` — undo

Reverts the last AI batch of the current session. A safety tool.

---

## Example prompts

- "Draw an auth flow diagram with a branch" → `convyy_draw`
- "Build an onboarding CJM with 6 stages and an emotions lane" → `convyy_apply_template` (`cjm`)
- "Launch kanban: Backlog / Doing / Review / Done" → `convyy_apply_template` (`kanban`)
- "Drop 5 sticky notes about risks" → `convyy_draw`
- "What's on this page right now?" → `convyy_analyze` (`page`)
- "Undo that" → `convyy_revert`

---

## Constraints (MVP)

- the agent does **not** edit existing user objects — it only adds new AI-owned content;
- every response is committed as a separate batch;
- undo only works for the last AI batch of the current session;
- native tables and images in `convyy_draw` are not supported yet (backlog) — grid-style tables
  are assembled from `shape` elements.

---

## Architecture

The public surface (what the model sees in `tools/list`) is owned by the server catalog.
Rendering to the board goes through the internal commit engine (`runPrompt` → `commitBatch`) —
which is no longer a public tool. The agent names a content tool directly (`convyy_draw` /
`convyy_apply_template`) and the server resolves the page and commits the batch.

```text
src/
  application/    # orchestration: runPrompt (internal commit engine), pages, analyze
  contracts/      # tool, session and host-adapter types
  orchestration/  # tool registry, follow-up actions, session machine
  runtime/        # runtime state (session ↔ page bindings)
  server/         # stdio transport, JSON-RPC, tool catalog
  tools/          # drawTool, templateTool, templatePresets
tests/
```

---

## Commands

```bash
npm install
npm run build
npm run smoke
npm run typecheck
npm run test
```

## Troubleshooting (relay)

If `tools/list` exposes the tools but nothing shows up on the board, the problem is the
board↔relay link, not MCP registration:

1. the board's relay diagnostics panel is open and not `disabled`;
2. it reached `healthy` (instead of getting stuck in `connecting`/`failing`);
3. the local relay is listening on `127.0.0.1:4318`;
4. the server was started **without** `--local`.

An error like `Unknown command: /convyy_draw` only means a tool was called as a slash command —
it's not a server failure. Tools are invoked through `tools/call`.
