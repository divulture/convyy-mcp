import type { McpToolDefinition } from "../contracts/tool";
import { createBoardSummaryTool } from "./boardSummaryTool";
import { createDiagramTool } from "./diagramTool";
import { createJourneyMapTool } from "./journeyMapTool";
import { createKanbanTool } from "./kanbanTool";
import { createTemplateFillTool } from "./templateFillTool";
import { createVisionSummaryTool } from "./visionSummaryTool";

export function createDefaultTools(): ReadonlyArray<McpToolDefinition> {
  return [
    createDiagramTool(),
    createKanbanTool(),
    createTemplateFillTool(),
    createJourneyMapTool(),
    createVisionSummaryTool(),
    createBoardSummaryTool(),
  ];
}
