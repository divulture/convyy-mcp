import type { McpToolDefinition } from "../contracts/tool";
import { createDrawTool } from "./drawTool";
import { createTemplateTool } from "./templateTool";

// The two content tools the model selects between. Page/analyze/revert are
// service-level tools handled directly in the server, not via execute().
export function createDefaultTools(): ReadonlyArray<McpToolDefinition> {
  return [createDrawTool(), createTemplateTool()];
}
