import type { ToolCallFailure } from '../loop/toolDispatch';

export const TOOL_DECLINED_CODE = 'TOOL_DECLINED';

/**
 * Builds the structured failure observation reinjected into the model's
 * history when the user declines a tool call, instead of ever calling
 * that tool's `execute`. The message is written for the model to reason
 * about — naming the tool and stating plainly that the user refused —
 * so it can choose a different approach or ask the user for
 * clarification, rather than repeating the same call.
 */
export function toolDeclinedResult(toolCallId: string, toolName: string): ToolCallFailure {
  return {
    ok: false,
    toolCallId,
    toolName,
    error: {
      code: TOOL_DECLINED_CODE,
      message: `the user declined to run "${toolName}"; choose a different approach or ask the user for clarification instead of retrying this exact call`,
    },
  };
}
