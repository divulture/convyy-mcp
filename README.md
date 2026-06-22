# Convyy MCP

`Convyy MCP` is a standalone stdio MCP server that lets an AI client operate on an already open Convyy board.

Typical usage:

1. the user opens Convyy in the browser;
2. the user connects `Convyy MCP` in Codex, Claude, Cursor, Cline, or another MCP client;
3. the agent receives MCP tools;
4. the agent calls those tools;
5. the result appears on the board.

## Critical Rules

These rules are not optional.

- `Convyy MCP` exposes MCP tools, not slash commands.
- Do not try to run `/convyy_list_pages` or any other `/convyy_*` command in the MCP client input.
- The correct protocol is `initialize` -> `tools/list` -> `tools/call`.
- Convyy board interaction must happen through MCP tools only.
- Do not render or mount an agent conversation UI inside the board.
- The user talks to Codex/Claude; the board is only the result surface.
- `sessionId` is a technical runtime/session identifier for batch ownership and rollback. It is not a signal to build an in-board conversation experience.
- `Unknown command` from a slash-command attempt does not prove that the MCP server is broken.
- `ToolSearch` failing to surface tools does not by itself prove that the MCP server is broken.

## What It Is For

`Convyy MCP` exists so an agent can work with an actual Convyy board instead of only producing text.

Through this MCP server, an agent can:

- read page context;
- understand which page the runtime session is bound to;
- create new AI-owned board content;
- commit each AI response as a separate batch;
- replace or revert only the latest AI batch for the current runtime session;
- choose a follow-up action such as `append`, `replace-last-batch`, `undo-last-batch`, `new-page`, or `bind-page`.

## Current Capabilities

The current MCP server includes:

- runtime state for session-to-page bindings;
- a one-active-generation gate per board runtime;
- follow-up action resolution;
- stdio MCP transport with `initialize`, `ping`, `tools/list`, and `tools/call`;
- an orchestration entrypoint for normal prompt workflows;
- direct tools for diagrams, kanban boards, template fill, journey maps, vision summaries, and generic board summaries.

## MVP Constraints

The current MVP is intentionally constrained:

- the agent does not edit existing user-created objects;
- the agent only adds new AI-owned content;
- every AI response becomes a separate batch;
- undo and replace only work for the latest AI batch of the current runtime session;
- board-specific side effects go through the controlled Convyy runtime layer.

## Main Tools

### `convyy_run_prompt`

The main orchestration tool.

It:

- resolves the follow-up action from the prompt;
- picks the correct tool path;
- works with page binding;
- commits the final batch to the board.

Use this by default unless you specifically need to call a specialized tool directly.

### `convyy_bind_session`

Explicitly binds the current runtime session to a page.

Use it when the agent should continue working on a specific page.

### `convyy_list_pages`

Returns the list of pages in the board.

Use it when the client needs to choose a page first.

### `convyy_revert_last_batch`

Reverts the latest AI batch for a runtime session.

### `convyy_get_runtime_state`

Returns the current MCP runtime state for the board.

Useful for diagnostic or system scenarios.

## Direct Tools

These tools are available separately, but in most cases `convyy_run_prompt` is enough.

### `convyy_create_diagram`

Builds a flow or diagram payload.

Good for:

- auth flows;
- onboarding flows;
- architecture diagrams;
- process flows.

### `convyy_create_kanban_board`

Builds a kanban payload.

Good for:

- backlog boards;
- launch boards;
- task boards;
- work-stage boards.

### `convyy_fill_board_template`

Prepares a payload for a built-in template.

Good for:

- SWOT;
- Business Model Canvas;
- roadmap-like template scenarios.

### `convyy_create_journey_map`

Builds a journey map payload.

Good for:

- onboarding journeys;
- customer journeys;
- service flows;
- service-blueprint-style scenarios.

### `convyy_analyze_page_images`

Prepares a vision-oriented payload from images found on the current page.

### `convyy_create_board_summary`

Generic fallback tool for summary, structure, and draft-style scenarios.

## Installation

Install `Convyy MCP` from its standalone Git repository:

```bash
git clone https://github.com/divulture/convyy-mcp.git
cd convyy-mcp
npm install
npm run build
```

Verification:

```bash
npm run typecheck
npm run test
```

## Connect It To An MCP Client

After building, `Convyy MCP` can be connected like any other stdio MCP server.

Important:

- `Convyy MCP` is distributed as a separate repository and installed separately by the developer;
- Convyy itself is opened separately at its hosted domain;
- the MCP server does not embed the board inside the AI client;
- the MCP server does not create a board-local conversation UI;
- it gives the agent tools to work with an already opened Convyy runtime.

Example:

```json
{
  "mcpServers": {
    "convyy": {
      "command": "node",
      "args": ["./dist/server.js"]
    }
  }
}
```

If you publish a binary entrypoint:

```json
{
  "mcpServers": {
    "convyy": {
      "command": "convyy-mcp",
      "args": []
    }
  }
}
```

## Recommended Usage Flow

1. establish a normal MCP session with `initialize`
2. call `tools/list`
3. confirm that `convyy_*` tools are actually present
4. call `convyy_list_pages`
5. call `convyy_bind_session` if a specific page should be targeted
6. call `convyy_run_prompt`
7. call `convyy_revert_last_batch` if the latest AI result should be rolled back

Example requests:

- `Create a kanban board for launch prep`
- `Build an onboarding journey map`
- `Create an auth flow diagram`
- `Fill a SWOT template for our product`
- `Analyze this screenshot and build a board summary`

## What Not To Do

Do not do any of the following:

- do not call `/convyy_list_pages`
- do not treat MCP tool names as slash commands
- do not conclude "server is broken" only because a slash command failed
- do not conclude "server is broken" only because search did not surface tools yet
- do not build or show a board-local conversation panel
- do not route user interaction through a board-side input box
- do not use the board as the conversation surface

## Minimal Verification

If you need to verify that the MCP server is healthy, use this order:

1. start the stdio server process
2. send `initialize`
3. send `tools/list`
4. verify that `convyy_run_prompt`, `convyy_list_pages`, `convyy_bind_session`, `convyy_revert_last_batch`, and `convyy_get_runtime_state` are present
5. only then start normal tool calls

If `tools/list` returns Convyy tools, the server is up. At that point, a failed slash command is irrelevant.

## Troubleshooting

### Symptom: `Unknown command: /convyy_list_pages`

This is a caller error, not evidence of MCP failure.

Reason:

- `/convyy_list_pages` is not a supported slash command;
- `convyy_list_pages` is an MCP tool name and must be called through `tools/call`.

### Symptom: search does not show any `convyy` tools

This is inconclusive on its own.

Possible causes:

- the MCP client has not finished initialization;
- the client is searching the wrong registry/path;
- the session has not completed `initialize` or `tools/list`;
- the tool-discovery UI is delayed or filtered.

Correct action:

1. verify the server process starts;
2. verify `initialize` succeeds;
3. verify `tools/list` returns `convyy_*` tools;
4. only then diagnose client-specific discovery issues.

### Symptom: the agent creates a conversation panel inside the board

This is an integration bug.

Correct model:

- user interaction belongs in Codex/Claude;
- Convyy is a visual output surface;
- MCP writes results to the board, but the board is not the conversation UI.

## What Is Required For Real Usage

To actually work with a board, both parts are required:

1. Convyy must be open in the browser at its hosted domain;
2. `Convyy MCP` must be connected in the AI client.

Typical flow:

1. the user opens Convyy;
2. the user opens an AI conversation in the MCP client;
3. the agent calls MCP tools;
4. the result appears in the active Convyy board runtime.

## Repository Structure

```text
src/
  application/
  contracts/
  orchestration/
  runtime/
  server/
  tools/
tests/
```

## Commands

```bash
npm install
npm run build
npm run typecheck
npm run test
```
