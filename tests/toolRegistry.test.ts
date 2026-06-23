import { describe, expect, it } from "vitest";

import { createStaticToolRegistry } from "../src/orchestration/toolRegistry";
import { createDefaultTools } from "../src/tools/defaultTools";

describe("toolRegistry", () => {
  it("lists stable default tools", () => {
    const registry = createStaticToolRegistry(createDefaultTools());

    expect(registry.listTools().map((tool) => tool.id)).toEqual([
      "convyy_draw",
      "convyy_apply_template",
    ]);
  });

  it("resolves the first tool that supports the prompt", () => {
    const registry = createStaticToolRegistry(createDefaultTools());

    expect(registry.resolveTool("build onboarding journey map")?.id).toBe("convyy_apply_template");
    expect(registry.resolveTool("create a kanban board")?.id).toBe("convyy_apply_template");
    expect(registry.resolveTool("draw a custom diagram")?.id).toBe("convyy_draw");
    expect(registry.resolveTool("something completely unrelated")).toBeNull();
  });
});
