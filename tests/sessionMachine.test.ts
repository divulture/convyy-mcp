import { describe, expect, it } from "vitest";

import { createEmptyMcpRuntimeState } from "../src/runtime/mcpRuntimeState";
import { createMcpSessionMachine } from "../src/orchestration/sessionMachine";

describe("sessionMachine", () => {
  it("binds a session to a page and stores the last batch", () => {
    const machine = createMcpSessionMachine(createEmptyMcpRuntimeState("board-1"));

    machine.bindSession("session-1", "page-1", "batch-1");

    expect(machine.getState().bindings).toHaveLength(1);
    expect(machine.getState().bindings[0]).toMatchObject({
      sessionId: "session-1",
      currentPageId: "page-1",
      lastBatchId: "batch-1",
    });
  });

  it("enforces one active generation per board runtime", () => {
    const machine = createMcpSessionMachine(createEmptyMcpRuntimeState("board-1"));

    expect(machine.startGeneration("session-1")).toEqual({
      ok: true,
      reason: "started",
    });

    expect(machine.startGeneration("session-2")).toEqual({
      ok: false,
      reason: "already-running",
    });
  });

  it("clears the active generation when the owning session finishes", () => {
    const machine = createMcpSessionMachine(createEmptyMcpRuntimeState("board-1"));

    machine.startGeneration("session-1");
    machine.finishGeneration("session-1");

    expect(machine.getState().activeGenerationSessionId).toBeNull();
  });
});
