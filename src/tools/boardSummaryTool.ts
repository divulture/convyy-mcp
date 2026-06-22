import type { McpToolDefinition } from "../contracts/tool";

export const BOARD_SUMMARY_TOOL_ID = "convyy_create_board_summary";

function deriveBullets(prompt: string): string[] {
  const parts = prompt
    .split(/\n|[.!?;]/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    return parts.slice(0, 3);
  }

  if (parts.length > 0) {
    return [parts[0] ?? "Main idea", parts[1] ?? "Key flow", parts[2] ?? "Next step"];
  }

  return ["Main idea", "Key flow", "Next step"];
}

export function createBoardSummaryTool(): McpToolDefinition {
  return {
    id: BOARD_SUMMARY_TOOL_ID,
    title: "Create Board Summary",
    description: "Create a generic board summary draft when no specialized tool path matches.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
    supports() {
      return true;
    },
    async execute(context) {
      return {
        toolId: BOARD_SUMMARY_TOOL_ID,
        title: "Board summary draft",
        summary: "Prepared a generic board summary draft.",
        payload: {
          title: context.prompt.trim().slice(0, 52) || "Board Summary",
          bullets: deriveBullets(context.prompt),
        },
      };
    },
  };
}
