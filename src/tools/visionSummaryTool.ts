import type { McpToolDefinition } from "../contracts/tool";

export const VISION_SUMMARY_TOOL_ID = "convyy_analyze_page_images";

function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().trim().replace(/\s+/g, " ");
}

export function isVisionPrompt(prompt: string): boolean {
  const normalized = normalizePrompt(prompt);
  return (
    normalized.includes("analyze image") ||
    normalized.includes("screenshot") ||
    normalized.includes("проанализируй изображ") ||
    normalized.includes("скрин")
  );
}

export function createVisionSummaryTool(): McpToolDefinition {
  return {
    id: VISION_SUMMARY_TOOL_ID,
    title: "Analyze Page Images",
    description: "Analyze page image references and prepare a board-oriented summary payload.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        pageName: { type: ["string", "null"] },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
    supports(prompt) {
      return isVisionPrompt(prompt);
    },
    async execute(context) {
      return {
        toolId: VISION_SUMMARY_TOOL_ID,
        title: "Vision summary draft",
        summary: "Prepared a board-oriented vision summary placeholder.",
        notes: [
          "Vision summary tool requires host-provided page image context.",
          `Prompt: ${context.prompt.trim() || "Analyze the current image context."}`,
        ],
        payload: {
          imageCount: 0,
          pageName: context.boundPageName,
        },
      };
    },
  };
}
