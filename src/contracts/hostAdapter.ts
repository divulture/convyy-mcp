export interface McpPageSummary {
  id: string;
  name: string;
}

export interface McpPageContext {
  pageId: string;
  pageName: string;
  summary: string;
  objectCount: number;
  imageCount: number;
}

export interface McpPlacementZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface McpVisionAsset {
  assetId: string;
  mimeType: string;
  base64: string;
}

export interface McpCommitBatchInput {
  sessionId: string;
  pageId: string;
  toolId: string;
  payload: unknown;
}

export interface McpCommitBatchResult {
  batchId: string;
  pageId: string;
}

export interface McpHostAdapter {
  listPages(): Promise<ReadonlyArray<McpPageSummary>>;
  createPage(name: string): Promise<McpPageSummary>;
  getPageContext(pageId: string): Promise<McpPageContext | null>;
  resolvePlacement(pageId: string): Promise<McpPlacementZone>;
  commitBatch(input: McpCommitBatchInput): Promise<McpCommitBatchResult>;
  revertLastBatch(sessionId: string): Promise<boolean>;
  loadVisionAssets?(pageId: string): Promise<ReadonlyArray<McpVisionAsset>>;
}
