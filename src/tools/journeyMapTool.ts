import type { McpToolDefinition } from "../contracts/tool";

export const JOURNEY_MAP_TOOL_ID = "convyy_create_journey_map";

const COLUMN_WIDTH = 240;
const ROW_HEIGHT = 124;
const HEADER_HEIGHT = 64;
const SIDE_LABEL_WIDTH = 180;
const START_X = 80;
const START_Y = 80;

function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().trim().replace(/\s+/g, " ");
}

export function isJourneyPrompt(prompt: string): boolean {
  const normalized = normalizePrompt(prompt);
  return (
    normalized.includes("journey") ||
    normalized.includes("путь клиента") ||
    normalized.includes("journey map") ||
    normalized.includes("service blueprint") ||
    normalized.includes("сценарий пользователя") ||
    normalized.includes("онбординг")
  );
}

function deriveStages(prompt: string) {
  const normalized = normalizePrompt(prompt);

  if (normalized.includes("онбординг") || normalized.includes("onboarding")) {
    return [
      {
        id: "journey-stage-1",
        title: "Discovery",
        userAction: "Finds the product and opens the landing flow",
        painPoint: "Does not yet understand the value",
        opportunity: "Clarify the first promise fast",
      },
      {
        id: "journey-stage-2",
        title: "Setup",
        userAction: "Creates profile and answers key questions",
        painPoint: "Too much friction during setup",
        opportunity: "Shorten the first-run questionnaire",
      },
      {
        id: "journey-stage-3",
        title: "Activation",
        userAction: "Completes the first successful action",
        painPoint: "Unclear next step after setup",
        opportunity: "Guide to one visible win",
      },
    ];
  }

  return [
    {
      id: "journey-stage-1",
      title: "Entry",
      userAction: "User enters the flow",
      painPoint: "Context is still unclear",
      opportunity: "Make the entry point more explicit",
    },
    {
      id: "journey-stage-2",
      title: "Decision",
      userAction: "User evaluates the next move",
      painPoint: "Questions and hesitation appear",
      opportunity: "Reduce uncertainty with guidance",
    },
    {
      id: "journey-stage-3",
      title: "Outcome",
      userAction: "User completes the scenario",
      painPoint: "Value may still feel fragile",
      opportunity: "Reinforce the result and next step",
    },
  ];
}

export function createJourneyMapTool(): McpToolDefinition {
  return {
    id: JOURNEY_MAP_TOOL_ID,
    title: "Create Journey Map",
    description: "Build a staged journey map with user actions, pain points, and opportunities.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
    supports(prompt) {
      return isJourneyPrompt(prompt);
    },
    async execute(context) {
      const stages = deriveStages(context.prompt);
      return {
        toolId: JOURNEY_MAP_TOOL_ID,
        title: "Journey map draft",
        summary: "Prepared a structured journey map draft.",
        payload: {
          title: "Journey Map",
          stages,
          zone: {
            x: START_X,
            y: START_Y,
            width: SIDE_LABEL_WIDTH + stages.length * COLUMN_WIDTH,
            height: HEADER_HEIGHT + ROW_HEIGHT * 3 + 56,
          },
        },
      };
    },
  };
}
