import type { ToolRegistry } from '../tools/registry';
import type { ToolExecutionContext } from '../tools/types';

export interface ToolCallRequest {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

export interface ToolCallSuccess {
  ok: true;
  toolCallId: string;
  toolName: string;
  output: unknown;
}

export interface ToolCallFailure {
  ok: false;
  toolCallId: string;
  toolName: string;
  error: { code: string; message: string };
}

export type ToolCallResult = ToolCallSuccess | ToolCallFailure;

function errorCodeOf(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return 'TOOL_EXECUTION_ERROR';
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Resolves one emitted tool call through the registry, validates its
 * arguments against the tool's Zod schema, and — only if both succeed —
 * calls the tool's `execute`. Every failure mode (unknown tool name,
 * schema-invalid arguments, or a thrown execution error) is normalized
 * into the same `ToolCallFailure` shape rather than throwing, so the
 * caller can always reinject a structured observation into the model's
 * history regardless of what went wrong.
 */
export async function dispatchToolCall(
  call: ToolCallRequest,
  registry: ToolRegistry,
  context: ToolExecutionContext,
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

  const parsed = tool.inputSchema.safeParse(call.input);
  if (!parsed.success) {
    return {
      ok: false,
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      error: { code: 'INVALID_TOOL_ARGUMENTS', message: parsed.error.message },
    };
  }

  try {
    const output = await tool.execute(parsed.data, context);
    return { ok: true, toolCallId: call.toolCallId, toolName: call.toolName, output };
  } catch (error) {
    return {
      ok: false,
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      error: { code: errorCodeOf(error), message: errorMessageOf(error) },
    };
  }
}

/**
 * Dispatches every call in `calls` in order, one at a time — never
 * concurrently — so two tool calls in the same model turn can't race
 * against each other (e.g. two writes to the same file), regardless of
 * whether the underlying tools would have been individually safe to
 * parallelize.
 */
export async function dispatchToolCalls(
  calls: readonly ToolCallRequest[],
  registry: ToolRegistry,
  context: ToolExecutionContext,
): Promise<ToolCallResult[]> {
  const results: ToolCallResult[] = [];
  for (const call of calls) {
    results.push(await dispatchToolCall(call, registry, context));
  }
  return results;
}
