import { describe, expect, it } from "vitest";

import { resolveFollowUpActionFromPrompt } from "../src/orchestration/followUpActions";

describe("followUpActions", () => {
  it("detects undo prompts", () => {
    expect(resolveFollowUpActionFromPrompt("отмени последний результат")).toEqual({
      type: "undo-last-batch",
    });
  });

  it("detects replace prompts", () => {
    expect(resolveFollowUpActionFromPrompt("replace the previous batch")).toEqual({
      type: "replace-last-batch",
    });
  });

  it("detects new-page prompts", () => {
    expect(resolveFollowUpActionFromPrompt("сделай это на новой странице")).toEqual({
      type: "new-page",
    });
  });

  it("detects bind-page prompts with a quoted page name", () => {
    expect(resolveFollowUpActionFromPrompt("привяжи к странице \"Research\"")).toEqual({
      type: "bind-page",
      targetPageName: "Research",
    });
  });

  it("falls back to append", () => {
    expect(resolveFollowUpActionFromPrompt("добавь еще пару идей")).toEqual({
      type: "append",
    });
  });
});
