import { describe, expect, it } from "vitest";

import { createConvyyMcpService } from "../src/application/convyyMcpService";
import { createMemoryRuntimeRepository } from "../src/runtime/memoryRuntimeRepository";
import { createDefaultTools } from "../src/tools/defaultTools";
import type { McpHostAdapter } from "../src/contracts/hostAdapter";

function createTestAdapter(): McpHostAdapter {
  const pages = [{ id: "page-1", name: "Main" }];
  const committed: Array<{ chatId: string; pageId: string; toolId: string; payload: unknown }> = [];
  let batchCounter = 0;

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
      batchCounter += 1;
      committed.push(input);
      return { batchId: `batch-${batchCounter}`, pageId: input.pageId };
    },
    async revertLastBatch() {
      return committed.length > 0;
    },
    async loadVisionAssets() {
      return [];
    },
  };
}

describe("convyyMcpService", () => {
  it("runs a prompt through the selected tool and commits a batch", async () => {
    const service = createConvyyMcpService({
      adapter: createTestAdapter(),
      runtimeRepository: createMemoryRuntimeRepository(),
      tools: createDefaultTools(),
    });

    const result = await service.runPrompt({
      boardId: "board-1",
      chatId: "chat-1",
      prompt: "create a kanban board for launch prep",
    });

    expect(result.committed).toBe(true);
    expect(result.toolId).toBe("convyy_create_kanban_board");
    expect(result.batchId).toBe("batch-1");
  });

  it("creates a new page when the prompt requests it", async () => {
    const service = createConvyyMcpService({
      adapter: createTestAdapter(),
      runtimeRepository: createMemoryRuntimeRepository(),
      tools: createDefaultTools(),
    });

    const result = await service.runPrompt({
      boardId: "board-1",
      chatId: "chat-1",
      prompt: "сделай это на новой странице: build onboarding journey map",
    });

    expect(result.followUpAction.type).toBe("new-page");
    expect(result.page.id).toBe("page-2");
  });
});
