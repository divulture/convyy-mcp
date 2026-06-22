import type { McpToolExecutionContext, McpToolExecutionResult } from "./session";

export interface McpToolInputSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface McpToolDefinition {
  id: string;
  title: string;
  description: string;
  inputSchema: McpToolInputSchema;
  supports(prompt: string): boolean;
  execute(context: McpToolExecutionContext): Promise<McpToolExecutionResult>;
}
