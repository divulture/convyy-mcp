import { describe, expect, it } from "vitest";

import { createConvyyMcpServer } from "../src/server";
import type { McpHostAdapter } from "../src/contracts/hostAdapter";

function createTestAdapter(): McpHostAdapter {
  const pages = [{ id: "page-1", name: "Main" }];

  return {
    async listPages() {
      return pages;
    },
    async createPage(name) {
      const page = { id: `page-${pages.length + 1}`, name };
      pages.push(page);
      return page;
    },
    async getPageContext(pageId) {
      const page = pages.find((item) => item.id === pageId);
      return page
        ? { pageId: page.id, pageName: page.name, summary: "Page summary", objectCount: 0, imageCount: 0 }
        : null;
    },
    async resolvePlacement() {
      return { x: 80, y: 80, width: 960, height: 540 };
    },
    async commitBatch(input) {
      return { batchId: `${input.toolId}-1`, pageId: input.pageId };
    },
    async revertLastBatch() {
      return true;
    },
    async loadVisionAssets() {
      return [];
    },
  };
}

describe("server", () => {
  it("returns MCP initialization response", async () => {
    const server = createConvyyMcpServer({ adapter: createTestAdapter() });

    const response = await server.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
    });

    expect(response?.result).toMatchObject({
      protocolVersion: "2024-11-05",
      serverInfo: { name: "@convyy/mcp", version: "0.1.0" },
    });
  });

  it("echoes the protocol version requested by the client", async () => {
    const server = createConvyyMcpServer({ adapter: createTestAdapter() });

    const response = await server.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18" },
    });

    expect(response?.result).toMatchObject({ protocolVersion: "2025-06-18" });
  });

  it("falls back to the default protocol version for unsupported requests", async () => {
    const server = createConvyyMcpServer({ adapter: createTestAdapter() });

    const response = await server.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "1999-01-01" },
    });

    expect(response?.result).toMatchObject({ protocolVersion: "2024-11-05" });
  });

  it("lists tools through the MCP tools/list method", async () => {
    const server = createConvyyMcpServer({ adapter: createTestAdapter() });

    const response = await server.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });

    const result = response?.result as { tools: Array<{ name: string }> };
    expect(result.tools.some((tool) => tool.name === "convyy_run_prompt")).toBe(true);
    expect(result.tools.some((tool) => tool.name === "convyy_create_diagram")).toBe(true);
  });

  it("executes convyy_run_prompt through tools/call", async () => {
    const server = createConvyyMcpServer({ adapter: createTestAdapter() });

    const response = await server.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "convyy_run_prompt",
        arguments: {
          boardId: "board-1",
          sessionId: "session-1",
          prompt: "create a kanban board",
        },
      },
    });

    const result = response?.result as { structuredContent: { toolId: string; page: { id: string } } };
    expect(result.structuredContent.toolId).toBe("convyy_create_kanban_board");
    expect(result.structuredContent.page.id).toBe("page-1");
  });
});
