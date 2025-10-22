export type ToolCallPreviewStatus = 'pending' | 'succeeded' | 'failed';

export interface ToolCallPreviewState {
  toolCallId: string;
  toolName: string;
  partialArgs: unknown;
  status: ToolCallPreviewStatus;
  result?: unknown;
}
