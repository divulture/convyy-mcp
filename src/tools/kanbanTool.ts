import type { McpToolDefinition } from "../contracts/tool";

export const KANBAN_TOOL_ID = "convyy_create_kanban_board";

function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().trim().replace(/\s+/g, " ");
}

export function isKanbanPrompt(prompt: string): boolean {
  const normalized = normalizePrompt(prompt);
  return (
    normalized.includes("kanban") ||
    normalized.includes("канбан") ||
    normalized.includes("доску задач") ||
    normalized.includes("таск борд") ||
    normalized.includes("task board")
  );
}

function deriveTitle(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  return trimmed.slice(0, 48) || "Kanban Board";
}

function buildCardsForTopic(prompt: string) {
  const normalized = normalizePrompt(prompt);

  if (normalized.includes("фич") || normalized.includes("feature")) {
    return [
      { id: "card-1", title: "Clarify scope", columnId: "c-1", status: "todo", order: 1000 },
      { id: "card-2", title: "Implement core flow", columnId: "c-2", status: "in-progress", order: 2000 },
      { id: "card-3", title: "QA and release", columnId: "c-3", status: "done", order: 3000 },
    ];
  }

  if (normalized.includes("launch") || normalized.includes("запуск")) {
    return [
      { id: "card-1", title: "Prepare assets", columnId: "c-1", status: "todo", order: 1000 },
      { id: "card-2", title: "Coordinate rollout", columnId: "c-2", status: "in-progress", order: 2000 },
      { id: "card-3", title: "Monitor feedback", columnId: "c-3", status: "done", order: 3000 },
    ];
  }

  return [
    { id: "card-1", title: "Backlog item", columnId: "c-1", status: "todo", order: 1000 },
    { id: "card-2", title: "Active task", columnId: "c-2", status: "in-progress", order: 2000 },
    { id: "card-3", title: "Completed task", columnId: "c-3", status: "done", order: 3000 },
  ];
}

export function createKanbanTool(): McpToolDefinition {
  return {
    id: KANBAN_TOOL_ID,
    title: "Create Kanban Board",
    description: "Build a kanban frame with default columns and starter cards.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
    supports(prompt) {
      return isKanbanPrompt(prompt);
    },
    async execute(context) {
      const columns = [
        { id: "c-1", title: "Todo", order: 1000 },
        { id: "c-2", title: "In Progress", order: 2000 },
        { id: "c-3", title: "Done", order: 3000 },
      ];

      return {
        toolId: KANBAN_TOOL_ID,
        title: "Kanban draft",
        summary: "Prepared a kanban board draft.",
        payload: {
          frame: {
            title: deriveTitle(context.prompt),
            frameKind: "kanban",
            x: 80,
            y: 80,
            width: 980,
            height: 420,
          },
          columns,
          cards: buildCardsForTopic(context.prompt),
          zone: {
            x: 80,
            y: 80,
            width: 980,
            height: 420,
          },
        },
      };
    },
  };
}
