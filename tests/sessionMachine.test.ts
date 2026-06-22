import { describe, expect, it } from "vitest";

import { createEmptyMcpRuntimeState } from "../src/runtime/mcpRuntimeState";
import { createMcpSessionMachine } from "../src/orchestration/sessionMachine";

describe("sessionMachine", () => {
  it("binds a chat to a page and stores the last batch", () => {
    const machine = createMcpSessionMachine(createEmptyMcpRuntimeState("board-1"));

    machine.bindChat("chat-1", "page-1", "batch-1");

    expect(machine.getState().bindings).toHaveLength(1);
    expect(machine.getState().bindings[0]).toMatchObject({
      chatId: "chat-1",
      currentPageId: "page-1",
      lastBatchId: "batch-1",
    });
  });

  it("enforces one active generation per board runtime", () => {
    const machine = createMcpSessionMachine(createEmptyMcpRuntimeState("board-1"));

    expect(machine.startGeneration("chat-1")).toEqual({
      ok: true,
      reason: "started",
    });

    expect(machine.startGeneration("chat-2")).toEqual({
      ok: false,
      reason: "already-running",
    });
  });

  it("clears the active generation when the owning chat finishes", () => {
    const machine = createMcpSessionMachine(createEmptyMcpRuntimeState("board-1"));

    machine.startGeneration("chat-1");
    machine.finishGeneration("chat-1");

    expect(machine.getState().activeGenerationChatId).toBeNull();
  });
});
