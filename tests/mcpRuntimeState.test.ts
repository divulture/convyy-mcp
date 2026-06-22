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
      activeGenerationChatId: null,
      bindings: [],
    });
  });

  it("normalizes parsed payloads without trusting persisted boardId", () => {
    const value = {
      boardId: "other-board",
      activeGenerationChatId: "chat-1",
      bindings: [
        {
          chatId: "chat-1",
          currentPageId: "page-1",
          lastBatchId: "batch-1",
          lastBoundAt: 123,
        },
        {
          chatId: 42,
        },
      ],
    };

    expect(normalizeMcpRuntimeState("board-1", value)).toEqual({
      boardId: "board-1",
      activeGenerationChatId: "chat-1",
      bindings: [
        {
          chatId: "chat-1",
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
      activeGenerationChatId: "chat-1",
      bindings: [
        {
          chatId: "chat-1",
          currentPageId: "page-1",
          lastBatchId: "batch-1",
          lastBoundAt: 123,
        },
      ],
    };

    expect(JSON.parse(serializeMcpRuntimeState(state))).toEqual({
      activeGenerationChatId: "chat-1",
      bindings: [
        {
          chatId: "chat-1",
          currentPageId: "page-1",
          lastBatchId: "batch-1",
          lastBoundAt: 123,
        },
      ],
    });
  });
});
