// Template presets for `convyy_apply_template` (standalone catalog layer).
// Mirrors features/ai/mcp/templatePresets.ts — keep the two in sync.

export interface TemplatePreset {
  id: string;
  title: string;
  kind: "grid" | "kanban";
  defaultLanes?: ReadonlyArray<{ id: string; label: string }>;
  laneColors: ReadonlyArray<string>;
  description: string;
  structureHint: string;
}

export const TEMPLATE_PRESETS: ReadonlyArray<TemplatePreset> = [
  {
    id: "cjm",
    title: "Customer Journey Map",
    kind: "grid",
    defaultLanes: [
      { id: "action", label: "Действия" },
      { id: "pain", label: "Боли" },
      { id: "opp", label: "Возможности" },
    ],
    laneColors: ["sky", "rose", "emerald"],
    description: "Customer journey map: stages as columns, lanes as rows. Add lanes (e.g. emotions, channels).",
    structureHint: "{ lanes:[{id,label}], stages:[{id,title,cells:{laneId:text}}] }",
  },
  {
    id: "swot",
    title: "SWOT Analysis",
    kind: "grid",
    defaultLanes: [
      { id: "strengths", label: "Strengths" },
      { id: "weaknesses", label: "Weaknesses" },
      { id: "opportunities", label: "Opportunities" },
      { id: "threats", label: "Threats" },
    ],
    laneColors: ["emerald", "rose", "sky", "amber"],
    description: "SWOT: four lanes; one stage column holds the content.",
    structureHint: "{ stages:[{id,title,cells:{strengths,weaknesses,opportunities,threats}}] }",
  },
  {
    id: "raci",
    title: "RACI Matrix",
    kind: "grid",
    defaultLanes: [
      { id: "role-1", label: "Role 1" },
      { id: "role-2", label: "Role 2" },
    ],
    laneColors: ["sky", "emerald", "amber", "violet", "rose", "orange"],
    description: "RACI: roles as lanes, tasks as stages, each cell holds R/A/C/I.",
    structureHint: "{ lanes:[{id,label}], stages:[{id,title,cells:{roleId:'R|A|C|I'}}] }",
  },
  {
    id: "retro",
    title: "Retrospective",
    kind: "grid",
    defaultLanes: [
      { id: "went-well", label: "What went well" },
      { id: "to-improve", label: "To improve" },
      { id: "action-items", label: "Action items" },
    ],
    laneColors: ["emerald", "amber", "sky"],
    description: "Retro board: three lanes, one stage column.",
    structureHint: "{ stages:[{id,title,cells:{'went-well','to-improve','action-items'}}] }",
  },
  {
    id: "bmc",
    title: "Business Model Canvas",
    kind: "grid",
    defaultLanes: [
      { id: "key-partners", label: "Key Partners" },
      { id: "key-activities", label: "Key Activities" },
      { id: "key-resources", label: "Key Resources" },
      { id: "value-propositions", label: "Value Propositions" },
      { id: "customer-relationships", label: "Customer Relationships" },
      { id: "channels", label: "Channels" },
      { id: "customer-segments", label: "Customer Segments" },
      { id: "cost-structure", label: "Cost Structure" },
      { id: "revenue-streams", label: "Revenue Streams" },
    ],
    laneColors: ["sky", "emerald", "amber", "rose", "violet", "orange"],
    description: "Business Model Canvas: nine lanes, one stage column.",
    structureHint: "{ stages:[{id,title,cells:{<each of the 9 block ids>}}] }",
  },
  {
    id: "kanban",
    title: "Kanban Board",
    kind: "kanban",
    laneColors: [],
    description: "Kanban board: columns and cards rendered as a native kanban frame.",
    structureHint: "{ columns:[{id,title,order}], cards:[{id,title,columnId,status,order}] }",
  },
];

export function listTemplatePresets(): ReadonlyArray<TemplatePreset> {
  return TEMPLATE_PRESETS;
}

export function getTemplatePreset(id: string): TemplatePreset | null {
  return TEMPLATE_PRESETS.find((preset) => preset.id === id) ?? null;
}
