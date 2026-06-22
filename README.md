# Convyy MCP

`Convyy MCP` is a standalone MCP server that lets AI clients work with Convyy boards.

Typical usage looks like this:

1. a user opens Convyy in the browser at the hosted domain;
2. a user connects `Convyy MCP` in Claude, Codex, Cursor, Cline, or another MCP client;
3. the agent gets access to Convyy board tools;
4. the agent works with the board through MCP tools.

## What It Is For

`Convyy MCP` exists so an agent can work with an actual Convyy board instead of only producing text.

Through this MCP server, an agent can:

- read page context;
- understand which page the chat is bound to;
- create new AI-owned board content;
- commit each AI response as a separate batch;
- replace or revert only the latest AI batch for the current chat;
- choose a follow-up action such as `append`, `replace-last-batch`, `undo-last-batch`, `new-page`, or `bind-page`.

## Current Capabilities

The current MCP server includes:

- runtime state for chat-to-page bindings;
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
- undo and replace only work for the latest AI batch of the current chat;
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

### `convyy_bind_chat`

Explicitly binds the current chat to a page.

Use it when the agent should continue working on a specific page.

### `convyy_list_pages`

Returns the list of pages in the board.

Use it when the client needs to choose a page first.

### `convyy_revert_last_batch`

Reverts the latest AI batch for a chat.

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
- the MCP server does not embed the board inside the AI client, it gives the agent tools to work with an already opened Convyy runtime.

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

1. call `convyy_list_pages`
2. call `convyy_bind_chat` if a specific page should be targeted
3. call `convyy_run_prompt`
4. call `convyy_revert_last_batch` if the latest AI result should be rolled back

Example requests:

- `Create a kanban board for launch prep`
- `Build an onboarding journey map`
- `Create an auth flow diagram`
- `Fill a SWOT template for our product`
- `Analyze this screenshot and build a board summary`

## What Is Required For Real Usage

To actually work with a board, both parts are required:

1. Convyy must be open in the browser at its hosted domain;
2. `Convyy MCP` must be connected in the AI client.

Typical flow:

1. the user opens Convyy;
2. the user opens an AI chat;
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
