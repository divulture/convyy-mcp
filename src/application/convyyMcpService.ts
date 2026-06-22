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
  sessionId: string;
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
    sessionId: string,
  ): Promise<McpPageSummary> {
    if (action.type === "new-page") {
      const page = await adapter.createPage(derivePageName(prompt, locale));
      machine.bindSession(sessionId, page.id, null);
      return page;
    }

    if (action.type === "bind-page") {
      const matched = findPageByName(pages, action.targetPageName);
      if (!matched) {
        throw new Error("Could not find a page for bind-page action.");
      }
      machine.bindSession(sessionId, matched.id, null);
      return matched;
    }

    if (explicitPageId) {
      const explicit = pages.find((page) => page.id === explicitPageId);
      if (explicit) {
        return explicit;
      }
    }

    const binding = machine.getState().bindings.find((item) => item.sessionId === sessionId) ?? null;
    if (binding?.currentPageId) {
      const boundPage = pages.find((page) => page.id === binding.currentPageId);
      if (boundPage) {
        return boundPage;
      }
    }

    const fallback = pages[0] ?? await adapter.createPage(locale === "ru" ? "AI страница" : "AI Page");
    machine.bindSession(sessionId, fallback.id, binding?.lastBatchId ?? null);
    return fallback;
  }

  return {
    async listPages() {
      return adapter.listPages();
    },

    async bindSession(boardId: string, sessionId: string, pageId: string) {
      const pages = await adapter.listPages();
      const page = pages.find((item) => item.id === pageId);
      if (!page) {
        throw new Error(`Page ${pageId} was not found.`);
      }

      const machine = await loadMachine(boardId);
      machine.bindSession(sessionId, page.id, null);
      await persistMachine(machine);

      return { page };
    },

    async getRuntimeState(boardId: string) {
      return (await runtimeRepository.load(boardId)) ?? createEmptyMcpRuntimeState(boardId);
    },

    async revertLastBatch(boardId: string, sessionId: string) {
      const machine = await loadMachine(boardId);
      const reverted = await adapter.revertLastBatch(sessionId);
      if (reverted) {
        machine.setLastBatchId(sessionId, null);
        await persistMachine(machine);
      }
      return { reverted };
    },

    async runPrompt(runInput: RunPromptInput): Promise<RunPromptResult> {
      const locale = runInput.locale ?? "en";
      const machine = await loadMachine(runInput.boardId);
      const start = machine.startGeneration(runInput.sessionId);
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
          runInput.sessionId,
        );

        const binding = machine.getState().bindings.find((item) => item.sessionId === runInput.sessionId) ?? null;
        const selectedTool =
          (runInput.toolId ? registry.listTools().find((tool) => tool.id === runInput.toolId) : null) ??
          registry.resolveTool(runInput.prompt);

        if (!selectedTool) {
          throw new Error("No tool matched the prompt.");
        }

        if (action.type === "replace-last-batch" && binding?.lastBatchId) {
          await adapter.revertLastBatch(runInput.sessionId);
          machine.setLastBatchId(runInput.sessionId, null);
        }

        if (action.type === "undo-last-batch") {
          const reverted = await adapter.revertLastBatch(runInput.sessionId);
          if (reverted) {
            machine.setLastBatchId(runInput.sessionId, null);
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
          sessionId: runInput.sessionId,
          prompt: runInput.prompt,
          locale,
          boundPageId: page.id,
          boundPageName: page.name,
        });

        const commit = await adapter.commitBatch({
          sessionId: runInput.sessionId,
          pageId: page.id,
          toolId: selectedTool.id,
          payload: toolResult.payload,
        });

        machine.bindSession(runInput.sessionId, page.id, commit.batchId);
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
        machine.finishGeneration(runInput.sessionId);
        await persistMachine(machine);
      }
    },
  };
}
