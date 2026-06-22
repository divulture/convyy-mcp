import type { McpHostAdapter, McpPageSummary } from "../contracts/hostAdapter";
import type { McpRuntimeRepository } from "../contracts/runtimeRepository";
import type { McpToolDefinition } from "../contracts/tool";
import type { McpFollowUpAction } from "../contracts/session";
import { createEmptyMcpRuntimeState } from "../runtime/mcpRuntimeState";
import { createMcpSessionMachine } from "../orchestration/sessionMachine";
import { createStaticToolRegistry } from "../orchestration/toolRegistry";
import { resolveFollowUpActionFromPrompt } from "../orchestration/followUpActions";

export interface RunPromptInput {
  boardId: string;
  chatId: string;
  prompt: string;
  locale?: "ru" | "en";
  pageId?: string | null;
  toolId?: string | null;
}

export interface RunPromptResult {
  followUpAction: McpFollowUpAction;
  page: McpPageSummary;
  toolId: string;
  summary: string;
  payload: unknown;
  batchId: string | null;
  committed: boolean;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function derivePageName(prompt: string, locale: "ru" | "en"): string {
  const trimmed = normalizeText(prompt).replace(/["'`]/g, "");
  if (!trimmed) {
    return locale === "ru" ? "AI страница" : "AI Page";
  }
  return trimmed.split(" ").slice(0, 6).join(" ").slice(0, 52);
}

function findPageByName(pages: ReadonlyArray<McpPageSummary>, targetName: string | null | undefined): McpPageSummary | null {
  if (!targetName) {
    return null;
  }

  const normalizedTarget = normalizeText(targetName).toLowerCase();
  return (
    pages.find((page) => normalizeText(page.name).toLowerCase() === normalizedTarget) ??
    pages.find((page) => normalizeText(page.name).toLowerCase().includes(normalizedTarget)) ??
    null
  );
}

export function createConvyyMcpService(input: {
  adapter: McpHostAdapter;
  runtimeRepository: McpRuntimeRepository;
  tools: ReadonlyArray<McpToolDefinition>;
}) {
  const { adapter, runtimeRepository, tools } = input;
  const registry = createStaticToolRegistry(tools);

  async function loadMachine(boardId: string) {
    const runtimeState = (await runtimeRepository.load(boardId)) ?? createEmptyMcpRuntimeState(boardId);
    return createMcpSessionMachine(runtimeState);
  }

  async function persistMachine(machine: ReturnType<typeof createMcpSessionMachine>) {
    await runtimeRepository.save(machine.getState());
  }

  async function resolveTargetPage(
    machine: ReturnType<typeof createMcpSessionMachine>,
    pages: ReadonlyArray<McpPageSummary>,
    action: McpFollowUpAction,
    prompt: string,
    explicitPageId: string | null | undefined,
    locale: "ru" | "en",
    chatId: string,
  ): Promise<McpPageSummary> {
    if (action.type === "new-page") {
      const page = await adapter.createPage(derivePageName(prompt, locale));
      machine.bindChat(chatId, page.id, null);
      return page;
    }

    if (action.type === "bind-page") {
      const matched = findPageByName(pages, action.targetPageName);
      if (!matched) {
        throw new Error("Could not find a page for bind-page action.");
      }
      machine.bindChat(chatId, matched.id, null);
      return matched;
    }

    if (explicitPageId) {
      const explicit = pages.find((page) => page.id === explicitPageId);
      if (explicit) {
        return explicit;
      }
    }

    const binding = machine.getState().bindings.find((item) => item.chatId === chatId) ?? null;
    if (binding?.currentPageId) {
      const boundPage = pages.find((page) => page.id === binding.currentPageId);
      if (boundPage) {
        return boundPage;
      }
    }

    const fallback = pages[0] ?? await adapter.createPage(locale === "ru" ? "AI страница" : "AI Page");
    machine.bindChat(chatId, fallback.id, binding?.lastBatchId ?? null);
    return fallback;
  }

  return {
    async listPages() {
      return adapter.listPages();
    },

    async bindChat(boardId: string, chatId: string, pageId: string) {
      const pages = await adapter.listPages();
      const page = pages.find((item) => item.id === pageId);
      if (!page) {
        throw new Error(`Page ${pageId} was not found.`);
      }

      const machine = await loadMachine(boardId);
      machine.bindChat(chatId, page.id, null);
      await persistMachine(machine);

      return { page };
    },

    async getRuntimeState(boardId: string) {
      return (await runtimeRepository.load(boardId)) ?? createEmptyMcpRuntimeState(boardId);
    },

    async revertLastBatch(boardId: string, chatId: string) {
      const machine = await loadMachine(boardId);
      const reverted = await adapter.revertLastBatch(chatId);
      if (reverted) {
        machine.setLastBatchId(chatId, null);
        await persistMachine(machine);
      }
      return { reverted };
    },

    async runPrompt(runInput: RunPromptInput): Promise<RunPromptResult> {
      const locale = runInput.locale ?? "en";
      const machine = await loadMachine(runInput.boardId);
      const start = machine.startGeneration(runInput.chatId);
      if (!start.ok) {
        throw new Error("Another generation is already running for this board runtime.");
      }

      try {
        const action = resolveFollowUpActionFromPrompt(runInput.prompt);
        const pages = await adapter.listPages();
        const page = await resolveTargetPage(
          machine,
          pages,
          action,
          runInput.prompt,
          runInput.pageId,
          locale,
          runInput.chatId,
        );

        const binding = machine.getState().bindings.find((item) => item.chatId === runInput.chatId) ?? null;
        const selectedTool =
          (runInput.toolId ? registry.listTools().find((tool) => tool.id === runInput.toolId) : null) ??
          registry.resolveTool(runInput.prompt);

        if (!selectedTool) {
          throw new Error("No tool matched the prompt.");
        }

        if (action.type === "replace-last-batch" && binding?.lastBatchId) {
          await adapter.revertLastBatch(runInput.chatId);
          machine.setLastBatchId(runInput.chatId, null);
        }

        if (action.type === "undo-last-batch") {
          const reverted = await adapter.revertLastBatch(runInput.chatId);
          if (reverted) {
            machine.setLastBatchId(runInput.chatId, null);
          }
          await persistMachine(machine);

          return {
            followUpAction: action,
            page,
            toolId: "convyy_revert_last_batch",
            summary: reverted ? "Reverted the last AI batch." : "No last AI batch was found to revert.",
            payload: { reverted },
            batchId: null,
            committed: false,
          };
        }

        const toolResult = await selectedTool.execute({
          chatId: runInput.chatId,
          prompt: runInput.prompt,
          locale,
          boundPageId: page.id,
          boundPageName: page.name,
        });

        const commit = await adapter.commitBatch({
          chatId: runInput.chatId,
          pageId: page.id,
          toolId: selectedTool.id,
          payload: toolResult.payload,
        });

        machine.bindChat(runInput.chatId, page.id, commit.batchId);
        await persistMachine(machine);

        return {
          followUpAction: action,
          page,
          toolId: selectedTool.id,
          summary: toolResult.summary,
          payload: toolResult.payload,
          batchId: commit.batchId,
          committed: true,
        };
      } finally {
        machine.finishGeneration(runInput.chatId);
        await persistMachine(machine);
      }
    },
  };
}
