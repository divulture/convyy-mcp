import { describe, expect, it } from "vitest";

import {
  createEmptyMcpRuntimeState,
  normalizeMcpRuntimeState,
  serializeMcpRuntimeState,
} from "../src/runtime/mcpRuntimeState";

describe("mcpRuntimeState", () => {
  it("creates an empty runtime state for a board", () => {
    expect(createEmptyMcpRuntimeState("board-1")).toEqual({
      boardId: "board-1",
      activeGenerationSessionId: null,
      bindings: [],
    });
  });

  it("normalizes parsed payloads without trusting persisted boardId", () => {
    const value = {
      boardId: "other-board",
      activeGenerationSessionId: "session-1",
      bindings: [
        {
          sessionId: "session-1",
          currentPageId: "page-1",
          lastBatchId: "batch-1",
          lastBoundAt: 123,
        },
        {
          sessionId: 42,
        },
      ],
    };

    expect(normalizeMcpRuntimeState("board-1", value)).toEqual({
      boardId: "board-1",
      activeGenerationSessionId: "session-1",
      bindings: [
        {
          sessionId: "session-1",
          currentPageId: "page-1",
          lastBatchId: "batch-1",
          lastBoundAt: 123,
        },
      ],
    });
  });

  it("serializes only session runtime fields", () => {
    const state = {
      boardId: "board-1",
      activeGenerationSessionId: "session-1",
      bindings: [
        {
          sessionId: "session-1",
          currentPageId: "page-1",
          lastBatchId: "batch-1",
          lastBoundAt: 123,
        },
      ],
    };

    expect(JSON.parse(serializeMcpRuntimeState(state))).toEqual({
      activeGenerationSessionId: "session-1",
      bindings: [
        {
          sessionId: "session-1",
          currentPageId: "page-1",
          lastBatchId: "batch-1",
          lastBoundAt: 123,
        },
      ],
    });
  });
});
