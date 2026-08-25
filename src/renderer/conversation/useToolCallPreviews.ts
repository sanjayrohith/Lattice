import { useEffect, useState } from 'react';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { ToolCallPreviewState } from './toolCallPreviewTypes';

function isFailureResult(result: unknown): boolean {
  return typeof result === 'object' && result !== null && 'ok' in result && result.ok === false;
}

/**
 * Tracks every in-flight tool call for `activeRunId` as a live preview,
 * driven entirely by `run:stream` events: `partial-tool-args` updates
 * the preview's argument object as the model's tool-call JSON is
 * progressively repaired and re-parsed, and `tool-result` finalizes it as
 * succeeded or failed. Previews are kept, not removed, once finished —
 * so the user can see what just ran, not just what is about to.
 */
export function useToolCallPreviews(activeRunId?: string): ToolCallPreviewState[] {
  const [previewsById, setPreviewsById] = useState<Map<string, ToolCallPreviewState>>(new Map());

  useEffect(() => {
    if (!window.electronAPI) return undefined;

    const unsubscribe = window.electronAPI.subscribe(IPC_CHANNELS.RUN_STREAM, (batch) => {
      if (!activeRunId) return;

      const relevant = batch.filter((event) => 'runId' in event && event.runId === activeRunId);
      if (relevant.length === 0) return;

      setPreviewsById((prev) => {
        const next = new Map(prev);

        for (const event of relevant) {
          if (event.type === 'tool-start') {
            const existing = next.get(event.toolCallId);
            next.set(event.toolCallId, {
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              partialArgs: existing?.partialArgs,
              status: 'pending',
            });
          } else if (event.type === 'partial-tool-args') {
            const existing = next.get(event.toolCallId);
            next.set(event.toolCallId, {
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              partialArgs: event.partialArgs,
              status: existing?.status ?? 'pending',
            });
          } else if (event.type === 'tool-result') {
            const existing = next.get(event.toolCallId);
            next.set(event.toolCallId, {
              toolCallId: event.toolCallId,
              toolName: existing?.toolName ?? '',
              partialArgs: existing?.partialArgs,
              status: isFailureResult(event.result) ? 'failed' : 'succeeded',
              result: event.result,
            });
          }
        }

        return next;
      });
    });

    return unsubscribe;
  }, [activeRunId]);

  return [...previewsById.values()];
}
