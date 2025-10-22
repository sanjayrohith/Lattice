import { dispatchToolCall, type ToolCallRequest, type ToolCallResult } from '../loop/toolDispatch';
import type { ToolRegistry } from '../tools/registry';
import type { ToolExecutionContext } from '../tools/types';
import type { ConsentGate } from './consentGate';
import { toolDeclinedResult } from './toolDeclinedResult';

/**
 * The consent-aware counterpart to {@link dispatchToolCall}: resolves the
 * tool, gates the call through `consentGate` using the tool's own
 * `defaultConsent`, and — only once accepted — actually dispatches it.
 * A decline never reaches the tool's `execute` at all; it short-circuits
 * straight to the structured `TOOL_DECLINED` failure result.
 */
export async function dispatchToolCallWithConsent(
  call: ToolCallRequest,
  registry: ToolRegistry,
  context: ToolExecutionContext,
  consentGate: ConsentGate,
  sessionId: string,
): Promise<ToolCallResult> {
  const tool = registry.get(call.toolName);
  if (!tool) {
    return {
      ok: false,
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      error: { code: 'UNKNOWN_TOOL', message: `no tool named "${call.toolName}" is registered` },
    };
  }

  const decision = await consentGate.requestConsent(
    sessionId,
    { toolCallId: call.toolCallId, toolName: call.toolName, input: call.input },
    tool.defaultConsent,
  );

  if (decision === 'declined') {
    return toolDeclinedResult(call.toolCallId, call.toolName);
  }

  return dispatchToolCall(call, registry, context);
}

/** Dispatches every call in `calls` in order, gating each through consent first. */
export async function dispatchToolCallsWithConsent(
  calls: readonly ToolCallRequest[],
  registry: ToolRegistry,
  context: ToolExecutionContext,
  consentGate: ConsentGate,
  sessionId: string,
): Promise<ToolCallResult[]> {
  const results: ToolCallResult[] = [];
  for (const call of calls) {
    results.push(await dispatchToolCallWithConsent(call, registry, context, consentGate, sessionId));
  }
  return results;
}
