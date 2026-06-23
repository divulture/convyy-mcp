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

  it("lists tools through the MCP tools/list method", async () => {
    const server = createConvyyMcpServer({ adapter: createTestAdapter() });

    const response = await server.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });

    const result = response?.result as { tools: Array<{ name: string }> };
    const names = result.tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining(["convyy_draw", "convyy_apply_template", "convyy_pages", "convyy_analyze", "convyy_revert"]),
    );
    // Legacy tools and the internal run_prompt engine are not exposed.
    expect(names).not.toContain("convyy_run_prompt");
    expect(names).not.toContain("convyy_create_diagram");
    expect(names).toHaveLength(5);
  });

  it("commits a content tool through tools/call via the internal engine", async () => {
    const server = createConvyyMcpServer({ adapter: createTestAdapter() });

    const response = await server.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "convyy_apply_template",
        arguments: {
          boardId: "board-1",
          sessionId: "session-1",
          prompt: "create a kanban board",
        },
      },
    });

    const result = response?.result as { structuredContent: { toolId: string; page: { id: string } } };
    expect(result.structuredContent.toolId).toBe("convyy_apply_template");
    expect(result.structuredContent.page.id).toBe("page-1");
  });
});
