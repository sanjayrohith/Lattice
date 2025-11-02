import type { RunStreamEvent } from '@shared/ipc/events';
import type { ToolCallResult } from '../loop/toolDispatch';

/** Tool names whose successful output is expected to carry a `path` identifying the file it wrote. */
const FILE_WRITING_TOOL_NAMES: ReadonlySet<string> = new Set(['write_file', 'edit_file', 'rewrite_file']);

/** The subordinate agent's output, normalized to a plain, transport-agnostic payload. */
export interface SubAgentResult {
  output: string;
  filesTouched: string[];
}

/**
 * Concatenates every `text-delta` event's `delta` in order, ignoring
 * every other event kind — the transport framing (JSON-RPC envelopes
 * over ACP, or the AI SDK's stream part wrappers) is already stripped
 * by the time an event reaches this shape, so this is a pure text
 * accumulation, not a parsing step.
 */
export function accumulateTextDeltas(events: readonly RunStreamEvent[]): string {
  return events
    .filter((event): event is Extract<RunStreamEvent, { type: 'text-delta' }> => event.type === 'text-delta')
    .map((event) => event.delta)
    .join('');
}

function pathFromToolOutput(output: unknown): string | undefined {
  if (output && typeof output === 'object' && 'path' in output && typeof output.path === 'string') {
    return output.path;
  }
  return undefined;
}

/**
 * Normalizes a subordinate agent's completed run into a plain result
 * payload: its accumulated text output, trimmed, and the deduplicated
 * list of workspace-relative paths any file-writing tool call
 * succeeded against. Failed tool calls never contribute a path — a
 * failed write did not actually touch the file.
 */
export function collectSubAgentResult(
  textEvents: readonly RunStreamEvent[],
  toolCallResults: readonly ToolCallResult[],
): SubAgentResult {
  const filesTouched = new Set<string>();

  for (const result of toolCallResults) {
    if (!result.ok || !FILE_WRITING_TOOL_NAMES.has(result.toolName)) continue;
    const path = pathFromToolOutput(result.output);
    if (path) filesTouched.add(path);
  }

  return {
    output: accumulateTextDeltas(textEvents).trim(),
    filesTouched: [...filesTouched],
  };
}
