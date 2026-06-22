import { describe, expect, it } from "vitest";

import { createStaticToolRegistry } from "../src/orchestration/toolRegistry";
import { createDefaultTools } from "../src/tools/defaultTools";

describe("toolRegistry", () => {
  it("lists stable default tools", () => {
    const registry = createStaticToolRegistry(createDefaultTools());

    expect(registry.listTools().map((tool) => tool.id)).toEqual([
      "convyy_create_diagram",
      "convyy_create_kanban_board",
      "convyy_fill_board_template",
      "convyy_create_journey_map",
      "convyy_analyze_page_images",
      "convyy_create_board_summary",
    ]);
  });

  it("resolves the first tool that supports the prompt", () => {
    const registry = createStaticToolRegistry(createDefaultTools());

    expect(registry.resolveTool("build onboarding journey map")?.id).toBe("convyy_create_journey_map");
    expect(registry.resolveTool("create a kanban board")?.id).toBe("convyy_create_kanban_board");
    expect(registry.resolveTool("something completely unrelated")?.id).toBe("convyy_create_board_summary");
  });
});
