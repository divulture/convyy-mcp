import type { McpToolDefinition } from "../contracts/tool";

export const DIAGRAM_TOOL_ID = "convyy_create_diagram";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 120;
const NODE_GAP = 84;
const START_X = 80;
const START_Y = 80;

function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().trim().replace(/\s+/g, " ");
}

export function isDiagramPrompt(prompt: string): boolean {
  const normalized = normalizePrompt(prompt);
  return (
    normalized.includes("схем") ||
    normalized.includes("flow") ||
    normalized.includes("diagram") ||
    normalized.includes("архитектур") ||
    normalized.includes("auth flow") ||
    normalized.includes("onboarding flow")
  );
}

function deriveNodeLabels(prompt: string): string[] {
  const normalized = prompt.trim();
  if (/auth|авторизац/i.test(normalized)) {
    return ["User opens app", "Credentials check", "Session granted"];
  }
  if (/onboarding|онборд/i.test(normalized)) {
    return ["Entry screen", "Profile setup", "Activation"];
  }
  if (/architect|архитект/i.test(normalized)) {
    return ["Client", "API", "Data store"];
  }
  return ["Start", "Core flow", "Result"];
}

function getNodeShapeType(index: number): "process" | "decision" {
  return index === 1 ? "decision" : "process";
}

function computeZone(nodes: ReadonlyArray<{ x: number; y: number; width: number; height: number }>) {
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function createDiagramTool(): McpToolDefinition {
  return {
    id: DIAGRAM_TOOL_ID,
    title: "Create Diagram",
    description: "Build a compact flow or architecture diagram with nodes and connectors.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
    supports(prompt) {
      return isDiagramPrompt(prompt);
    },
    async execute(context) {
      const labels = deriveNodeLabels(context.prompt);
      const nodes = labels.map((label, index) => ({
        id: `diagram-node-${index + 1}`,
        text: label,
        shapeType: getNodeShapeType(index),
        x: START_X + index * (NODE_WIDTH + NODE_GAP),
        y: START_Y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      }));
      const connectors = nodes.slice(0, -1).map((node, index) => ({
        id: `diagram-connector-${index + 1}`,
        sourceId: node.id,
        targetId: nodes[index + 1]!.id,
      }));

      return {
        toolId: DIAGRAM_TOOL_ID,
        title: "Diagram draft",
        summary: "Prepared a diagram draft with nodes and connectors.",
        payload: {
          nodes,
          connectors,
          zone: computeZone(nodes),
        },
      };
    },
  };
}
