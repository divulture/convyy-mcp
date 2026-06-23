import type { McpToolDefinition } from "../contracts/tool";
import { getTemplatePreset, listTemplatePresets, type TemplatePreset } from "./templatePresets";

export const APPLY_TEMPLATE_TOOL_ID = "convyy_apply_template";

const STICKY_COLORS = new Set(["amber", "sky", "emerald", "rose", "violet", "orange"]);

const PAD = 24;
const SIDE = 168;
const HEADER = 56;
const TITLE = 40;
const COL = 240;
const ROW = 124;

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resolveLaneColor(preset: TemplatePreset, index: number, provided: unknown): string {
  if (typeof provided === "string" && STICKY_COLORS.has(provided)) {
    return provided;
  }
  const palette = preset.laneColors.length > 0 ? preset.laneColors : ["amber"];
  return palette[index % palette.length] ?? "amber";
}

function normalizeLanes(preset: TemplatePreset, structure: Record<string, unknown>, overrides: Record<string, unknown>) {
  const fromStructure = Array.isArray(structure.lanes) ? (structure.lanes as Array<Record<string, unknown>>) : null;
  const base: Array<Record<string, unknown>> = fromStructure ?? (preset.defaultLanes?.map((lane) => ({ ...lane })) ?? []);
  const addLane = Array.isArray(overrides.addLane) ? (overrides.addLane as Array<Record<string, unknown>>) : [];
  return [...base, ...addLane].map((lane, index) => ({
    id: typeof lane.id === "string" && lane.id.trim() ? lane.id : `lane-${index + 1}`,
    label: typeof lane.label === "string" ? lane.label : `Lane ${index + 1}`,
    color: resolveLaneColor(preset, index, lane.color),
  }));
}

function normalizeStages(structure: Record<string, unknown>, overrides: Record<string, unknown>) {
  const fromStructure = Array.isArray(structure.stages) ? (structure.stages as Array<Record<string, unknown>>) : [];
  const addColumn = Array.isArray(overrides.addColumn) ? (overrides.addColumn as Array<Record<string, unknown>>) : [];
  return [...fromStructure, ...addColumn].map((stage, index) => {
    const rawCells = stage.cells && typeof stage.cells === "object" ? (stage.cells as Record<string, unknown>) : {};
    const cells: Record<string, string> = {};
    Object.keys(rawCells).forEach((key) => {
      cells[key] = typeof rawCells[key] === "string" ? (rawCells[key] as string) : "";
    });
    return {
      id: typeof stage.id === "string" && stage.id.trim() ? stage.id : `stage-${index + 1}`,
      title: typeof stage.title === "string" && stage.title.trim() ? stage.title : `Stage ${index + 1}`,
      cells,
    };
  });
}

function buildKanban(structure: Record<string, unknown>, prompt: string) {
  const rawColumns = Array.isArray(structure.columns) ? (structure.columns as Array<Record<string, unknown>>) : [];
  const rawCards = Array.isArray(structure.cards) ? (structure.cards as Array<Record<string, unknown>>) : [];
  const columns = (rawColumns.length > 0
    ? rawColumns
    : [
      { id: "c-1", title: "Todo", order: 1000 },
      { id: "c-2", title: "In Progress", order: 2000 },
      { id: "c-3", title: "Done", order: 3000 },
    ]
  ).map((column, index) => ({
    id: typeof column.id === "string" && column.id.trim() ? column.id : `c-${index + 1}`,
    title: typeof column.title === "string" ? column.title : `Column ${index + 1}`,
    order: asNumber(column.order) ?? (index + 1) * 1000,
  }));
  const allowed = new Set(["todo", "in-progress", "done"]);
  const cards = rawCards.map((card, index) => ({
    id: typeof card.id === "string" && card.id.trim() ? card.id : `card-${index + 1}`,
    title: typeof card.title === "string" ? card.title : `Card ${index + 1}`,
    columnId: typeof card.columnId === "string" ? card.columnId : columns[0]!.id,
    status: typeof card.status === "string" && allowed.has(card.status) ? card.status : "todo",
    order: asNumber(card.order) ?? (index + 1) * 1000,
  }));

  return {
    templateId: "kanban",
    frame: {
      title: prompt.trim().replace(/\s+/g, " ").slice(0, 48) || "Kanban Board",
      frameKind: "kanban",
      x: 80,
      y: 80,
      width: 980,
      height: 420,
    },
    columns,
    cards,
    zone: { x: 80, y: 80, width: 980, height: 420 },
  };
}

function inferTemplateId(prompt: string): string | null {
  const normalized = prompt.toLowerCase();
  if (normalized.includes("kanban") || normalized.includes("канбан") || normalized.includes("task board") || normalized.includes("таск борд") || normalized.includes("доску задач")) return "kanban";
  if (normalized.includes("swot")) return "swot";
  if (normalized.includes("raci")) return "raci";
  if (normalized.includes("retro") || normalized.includes("ретро")) return "retro";
  if (normalized.includes("bmc") || normalized.includes("business model")) return "bmc";
  if (normalized.includes("cjm") || normalized.includes("journey") || normalized.includes("путь клиент") || normalized.includes("customer journey")) return "cjm";
  return null;
}

export function buildApplyTemplatePayload(args: Record<string, unknown> | null | undefined, prompt: string) {
  const templateId = typeof args?.templateId === "string" ? args.templateId : inferTemplateId(prompt);
  if (args?.list === true || !templateId) {
    return {
      templateId: "__list__",
      title: "Available templates",
      lanes: [] as Array<{ id: string; label: string; color: string }>,
      stages: [] as Array<{ id: string; title: string; cells: Record<string, string> }>,
      zone: { x: 80, y: 80, width: 320, height: 200 },
      templates: listTemplatePresets().map((preset) => ({
        id: preset.id,
        title: preset.title,
        kind: preset.kind,
        description: preset.description,
        structureHint: preset.structureHint,
      })),
    };
  }

  const preset = getTemplatePreset(templateId);
  if (!preset) {
    throw new Error(`Unknown templateId "${templateId}". Call convyy_apply_template with { list: true } to see options.`);
  }

  const structure = args?.structure && typeof args.structure === "object" ? (args.structure as Record<string, unknown>) : {};
  const overrides = args?.overrides && typeof args.overrides === "object" ? (args.overrides as Record<string, unknown>) : {};

  if (preset.kind === "kanban") {
    return buildKanban(structure, prompt);
  }

  const lanes = normalizeLanes(preset, structure, overrides);
  const stages = normalizeStages(structure, overrides);
  const title = typeof structure.title === "string" && structure.title.trim() ? structure.title : preset.title;
  const width = PAD + SIDE + Math.max(stages.length, 1) * COL + PAD;
  const height = PAD + TITLE + HEADER + Math.max(lanes.length, 1) * ROW + PAD;

  return { templateId: preset.id, title, lanes, stages, zone: { x: 80, y: 80, width, height } };
}

export function createTemplateTool(): McpToolDefinition {
  return {
    id: APPLY_TEMPLATE_TOOL_ID,
    title: "Apply Template",
    description:
      "Apply a named, adaptive template (cjm, swot, raci, retro, bmc, kanban). You provide the structure " +
      "(lanes and stages of any size); the server owns the layout and inherits the preset style. The grid " +
      "grows to fit your content. Call with { list: true } to see available templates and their structure.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Short description (used for kanban frame title and fallback)." },
        list: { type: "boolean", description: "Return the available templates instead of rendering." },
        templateId: { type: "string", description: "cjm | swot | raci | retro | bmc | kanban" },
        structure: {
          type: "object",
          description:
            "Grid templates: { lanes:[{id,label,color?}], stages:[{id,title,cells:{laneId:text}}] }. " +
            "Kanban: { columns:[{id,title,order}], cards:[{id,title,columnId,status,order}] }.",
          additionalProperties: true,
        },
        overrides: {
          type: "object",
          description: "Optional: { addLane:[{id,label}], addColumn:[{id,title}] } to extend the grid on the fly.",
          additionalProperties: true,
        },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
    supports(prompt) {
      const normalized = prompt.toLowerCase();
      return (
        normalized.includes("cjm") ||
        normalized.includes("journey") ||
        normalized.includes("путь клиент") ||
        normalized.includes("kanban") ||
        normalized.includes("канбан") ||
        normalized.includes("swot") ||
        normalized.includes("raci") ||
        normalized.includes("retro") ||
        normalized.includes("bmc") ||
        normalized.includes("business model") ||
        normalized.includes("шаблон") ||
        normalized.includes("template")
      );
    },
    async execute(context) {
      return {
        toolId: APPLY_TEMPLATE_TOOL_ID,
        title: "Template draft",
        summary: "Applied the named template with agent-provided structure.",
        payload: buildApplyTemplatePayload(context.args ?? null, context.prompt),
      };
    },
  };
}
