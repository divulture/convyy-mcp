import type { McpToolDefinition } from "../contracts/tool";

export const DRAW_TOOL_ID = "convyy_draw";

const SHAPE_TYPES = new Set([
  "rectangle", "rounded-rectangle", "ellipse", "diamond", "parallelogram", "star",
  "triangle", "hexagon", "process", "decision", "terminator", "data", "document",
  "database", "manual-operation", "preparation", "internal-storage", "predefined-process",
  "stored-data", "display", "delay", "merge", "off-page-connector", "direct-access-storage",
  "comment", "note", "circle-plus", "circle-x",
]);
const STICKY_COLORS = new Set(["amber", "sky", "emerald", "rose", "violet", "orange"]);
const SHAPE_FILLS = new Set(["transparent", "white", "ink", "amber", "emerald", "sky", "violet", "rose"]);
const LAYOUTS = new Set(["free", "flow-lr", "grid"]);

const DEFAULT_SIZE: Record<string, { width: number; height: number }> = {
  shape: { width: 220, height: 120 },
  sticky: { width: 200, height: 160 },
  frame: { width: 600, height: 400 },
  text: { width: 320, height: 48 },
};
const START = 80;
const GAP_X = 84;
const GAP_Y = 80;
const PER_ROW = 4;

type DrawElementOut =
  | { kind: "frame"; id: string; title: string; x: number; y: number; width: number; height: number }
  | { kind: "shape"; id: string; text: string; shapeType: string; x: number; y: number; width: number; height: number; fill?: string }
  | { kind: "sticky"; id: string; text: string; color: string; x: number; y: number; width: number; height: number }
  | { kind: "text"; id: string; text: string; x: number; y: number; width: number; height: number; fontSize?: number; bold?: boolean }
  | { kind: "connector"; id: string; sourceId: string; targetId: string; label?: string };

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function inferKind(raw: Record<string, unknown>): string {
  if (typeof raw.kind === "string") return raw.kind;
  if (raw.from != null || raw.to != null || raw.source != null || raw.target != null) return "connector";
  if (typeof raw.shapeType === "string") return "shape";
  if (typeof raw.color === "string") return "sticky";
  if (typeof raw.title === "string") return "frame";
  return "text";
}

function computeZone(elements: ReadonlyArray<DrawElementOut>) {
  const boxes = elements.filter(
    (element): element is Exclude<DrawElementOut, { kind: "connector" }> => element.kind !== "connector",
  );
  if (boxes.length === 0) {
    return { x: START, y: START, width: 320, height: 200 };
  }
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Normalize the agent-provided `elements` into a render-ready payload. The agent
 * owns content/structure; this owns ids, default sizes, auto-layout, validation.
 * Empty `elements` is a "thinking" signal — nothing is drawn.
 */
export function buildDrawPayload(args: Record<string, unknown> | null | undefined, prompt: string) {
  const layout = typeof args?.layout === "string" && LAYOUTS.has(args.layout) ? args.layout : "free";
  const rawElements = Array.isArray(args?.elements) ? (args!.elements as Array<Record<string, unknown>>) : [];
  if (rawElements.length === 0) {
    // Thinking signal: wakes the on-board cursor, draws nothing.
    return { elements: [] as DrawElementOut[], zone: { x: START, y: START, width: 0, height: 0 } };
  }

  let slot = 0;
  const nextSlot = (raw: Record<string, unknown>, width: number, height: number) => {
    const hasXY = asNumber(raw.x) !== null && asNumber(raw.y) !== null;
    if (layout === "free" && hasXY) {
      return { x: asNumber(raw.x)!, y: asNumber(raw.y)! };
    }
    const col = slot % PER_ROW;
    const row = Math.floor(slot / PER_ROW);
    slot += 1;
    return {
      x: asNumber(raw.x) ?? START + col * (width + GAP_X),
      y: asNumber(raw.y) ?? START + row * (height + GAP_Y),
    };
  };

  const elements: DrawElementOut[] = [];
  const keyToId = new Map<string, string>();
  const connectorsRaw: Array<{ raw: Record<string, unknown>; index: number }> = [];

  rawElements.forEach((raw, index) => {
    const kind = inferKind(raw);
    if (kind === "connector") {
      connectorsRaw.push({ raw, index });
      return;
    }
    if (kind !== "shape" && kind !== "sticky" && kind !== "frame" && kind !== "text") {
      return;
    }

    const defaults = DEFAULT_SIZE[kind]!;
    const width = asNumber(raw.width) ?? defaults.width;
    const height = asNumber(raw.height) ?? defaults.height;
    const { x, y } = nextSlot(raw, width, height);
    const id = typeof raw.id === "string" && raw.id.trim() ? raw.id : `draw-${kind}-${index + 1}`;
    const text = typeof raw.text === "string" ? raw.text : "";
    keyToId.set(id, id);
    keyToId.set(String(index + 1), id);
    if (text) keyToId.set(text.toLowerCase(), id);

    if (kind === "frame") {
      const title = typeof raw.title === "string" ? raw.title : text;
      if (title) keyToId.set(title.toLowerCase(), id);
      elements.push({ kind, id, title, x, y, width, height });
    } else if (kind === "shape") {
      const shapeType = typeof raw.shapeType === "string" && SHAPE_TYPES.has(raw.shapeType) ? raw.shapeType : "process";
      const fill = typeof raw.fill === "string" && SHAPE_FILLS.has(raw.fill) ? raw.fill : undefined;
      elements.push({ kind, id, text, shapeType, x, y, width, height, ...(fill ? { fill } : {}) });
    } else if (kind === "sticky") {
      const color = typeof raw.color === "string" && STICKY_COLORS.has(raw.color) ? raw.color : "amber";
      elements.push({ kind, id, text, color, x, y, width, height });
    } else {
      const fontSize = asNumber(raw.fontSize) ?? undefined;
      const bold = typeof raw.bold === "boolean" ? raw.bold : undefined;
      elements.push({ kind, id, text, x, y, width, height, ...(fontSize ? { fontSize } : {}), ...(bold != null ? { bold } : {}) });
    }
  });

  const resolveEndpoint = (value: unknown): string | null => {
    if (value == null) return null;
    const key = String(value);
    return keyToId.get(key) ?? keyToId.get(key.toLowerCase()) ?? null;
  };

  connectorsRaw.forEach(({ raw, index }) => {
    const sourceId = resolveEndpoint(raw.from ?? raw.source ?? raw.sourceId);
    const targetId = resolveEndpoint(raw.to ?? raw.target ?? raw.targetId);
    if (!sourceId || !targetId) {
      return;
    }
    elements.push({
      kind: "connector",
      id: `draw-connector-${index + 1}`,
      sourceId,
      targetId,
      ...(typeof raw.label === "string" ? { label: raw.label } : {}),
    });
  });

  return { elements, zone: computeZone(elements) };
}

export function createDrawTool(): McpToolDefinition {
  return {
    id: DRAW_TOOL_ID,
    title: "Draw On Board",
    description:
      "Render any board content you compose from native primitives. Provide `elements` (shape, sticky, " +
      "frame, text, connector); the server owns ids, layout and styling. Use this for anything that does " +
      "not fit a named template. THINKING SIGNAL: when you START handling the user's request, call this " +
      "once with empty `elements: []` so the board shows your cursor 'thinking'; then call it again with the " +
      "real `elements` once you have composed the answer.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Short description of what to draw." },
        layout: { type: "string", description: "Layout hint: free | flow-lr | grid. Default free." },
        elements: {
          type: "array",
          description:
            "Elements you generate from the request. Each is one of: " +
            "{ kind:'shape', id, text, shapeType, x?,y?,width?,height?, fill? } | " +
            "{ kind:'sticky', id, text, color?, x?,y?,width?,height? } | " +
            "{ kind:'frame', id, title, x?,y?,width?,height? } | " +
            "{ kind:'text', id, text, x?,y?,width?,height?, fontSize?, bold? } | " +
            "{ kind:'connector', from, to, label? }. Omit coordinates to let the server lay them out.",
          items: { type: "object", additionalProperties: true },
        },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
    supports(prompt) {
      const normalized = prompt.toLowerCase();
      return (
        normalized.includes("нарисуй") ||
        normalized.includes("draw") ||
        normalized.includes("схем") ||
        normalized.includes("flow") ||
        normalized.includes("diagram") ||
        normalized.includes("диаграм") ||
        normalized.includes("архитектур") ||
        normalized.includes("стикер") ||
        normalized.includes("sticky") ||
        normalized.includes("набросай") ||
        normalized.includes("summary")
      );
    },
    async execute(context) {
      return {
        toolId: DRAW_TOOL_ID,
        title: "Draw draft",
        summary: "Rendered the agent-provided board elements.",
        payload: buildDrawPayload(context.args ?? null, context.prompt),
      };
    },
  };
}
