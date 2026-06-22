import type { McpToolDefinition } from "../contracts/tool";

export const TEMPLATE_FILL_TOOL_ID = "convyy_fill_board_template";

function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().trim().replace(/\s+/g, " ");
}

function splitPrompt(prompt: string, count: number): string[] {
  const cleaned = prompt
    .split(/\n|[.!?;]/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (cleaned.length >= count) {
    return cleaned.slice(0, count);
  }

  if (cleaned.length > 0) {
    return Array.from({ length: count }, (_, index) => cleaned[index] ?? `${cleaned[0]} ${index + 1}`);
  }

  return Array.from({ length: count }, (_, index) => `Item ${index + 1}`);
}

function resolveTemplateId(prompt: string): "swot-analysis" | "business-model-canvas" | "gantt-chart" | null {
  const normalized = normalizePrompt(prompt);
  if (normalized.includes("swot")) {
    return "swot-analysis";
  }
  if (normalized.includes("business model") || normalized.includes("bmc")) {
    return "business-model-canvas";
  }
  if (normalized.includes("roadmap") || normalized.includes("gantt")) {
    return "gantt-chart";
  }
  return null;
}

export function createTemplateFillTool(): McpToolDefinition {
  return {
    id: TEMPLATE_FILL_TOOL_ID,
    title: "Fill Board Template",
    description: "Pick a built-in strategic template and fill its sections from the prompt.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
    supports(prompt) {
      return resolveTemplateId(prompt) !== null;
    },
    async execute(context) {
      const templateId = resolveTemplateId(context.prompt);
      if (!templateId) {
        return {
          toolId: TEMPLATE_FILL_TOOL_ID,
          summary: "No matching built-in template was found.",
          payload: { error: "template_not_supported" },
        };
      }

      if (templateId === "swot-analysis") {
        const items = splitPrompt(context.prompt, 4);
        return {
          toolId: TEMPLATE_FILL_TOOL_ID,
          title: "Filled template draft",
          summary: "Prepared a filled built-in template draft.",
          payload: {
            templateId,
            title: "SWOT Analysis",
            sections: [
              { id: "strengths", title: "Strengths", content: items[0] ?? "" },
              { id: "weaknesses", title: "Weaknesses", content: items[1] ?? "" },
              { id: "opportunities", title: "Opportunities", content: items[2] ?? "" },
              { id: "threats", title: "Threats", content: items[3] ?? "" },
            ],
            zone: { x: 80, y: 80, width: 920, height: 520 },
          },
        };
      }

      if (templateId === "business-model-canvas") {
        const items = splitPrompt(context.prompt, 9);
        const titles = [
          "Key Partners",
          "Key Activities",
          "Key Resources",
          "Value Propositions",
          "Customer Relationships",
          "Channels",
          "Customer Segments",
          "Cost Structure",
          "Revenue Streams",
        ];

        return {
          toolId: TEMPLATE_FILL_TOOL_ID,
          title: "Filled template draft",
          summary: "Prepared a filled built-in template draft.",
          payload: {
            templateId,
            title: "Business Model Canvas",
            sections: titles.map((title, index) => ({
              id: `bmc-${index + 1}`,
              title,
              content: items[index] ?? "",
            })),
            zone: { x: 80, y: 80, width: 1180, height: 640 },
          },
        };
      }

      const items = splitPrompt(context.prompt, 3);
      return {
        toolId: TEMPLATE_FILL_TOOL_ID,
        title: "Filled template draft",
        summary: "Prepared a filled built-in template draft.",
        payload: {
          templateId,
          title: "Gantt Chart",
          sections: [
            { id: "project", title: "Project", content: items[0] ?? "" },
            { id: "phase-1", title: "Phase 1", content: items[1] ?? "" },
            { id: "phase-2", title: "Phase 2", content: items[2] ?? "" },
          ],
          zone: { x: 80, y: 80, width: 1120, height: 520 },
        },
      };
    },
  };
}
