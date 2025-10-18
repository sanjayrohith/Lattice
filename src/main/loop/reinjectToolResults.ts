import type { InternalMessage, InternalMessagePart } from '../ai/messages';
import type { ToolCallResult } from './toolDispatch';

/**
 * Converts a batch of tool call results — successes and structured
 * failures alike — into the single `tool`-role message the model
 * expects as its next turn's observation. A failure's `error` is folded
 * into `output` with `isError: true` rather than dropped, so the model
 * can see exactly what went wrong (an unknown tool, invalid arguments,
 * or a thrown execution error) and adjust its next call accordingly.
 */
export function toolResultsToMessage(results: readonly ToolCallResult[]): InternalMessage {
  const parts: InternalMessagePart[] = results.map((result) => ({
    type: 'tool-result',
    toolCallId: result.toolCallId,
    toolName: result.toolName,
    output: result.ok ? result.output : { error: result.error },
    isError: !result.ok,
  }));

  return { role: 'tool', parts };
}

/**
 * Appends one turn's tool results to `history` as a single tool message,
 * handing the model another turn with every observation it needs. A
 * step that emitted no tool calls appends nothing, leaving `history`
 * unchanged.
 */
export function appendToolResults(
  history: readonly InternalMessage[],
  results: readonly ToolCallResult[],
): InternalMessage[] {
  if (results.length === 0) {
    return [...history];
  }
  return [...history, toolResultsToMessage(results)];
}
