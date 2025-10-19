import type Database from 'better-sqlite3';
import type { MessageRepository } from '../db/repositories/messageRepository';
import type { ToolCallRepository } from '../db/repositories/toolCallRepository';
import type { UsageRepository } from '../db/repositories/usageRepository';
import type { StepUsage } from '../ai/usage';
import type { ToolCallRequest, ToolCallResult } from './toolDispatch';

export interface StepPersistenceRepositories {
  messages: MessageRepository;
  toolCalls: ToolCallRepository;
  usage: UsageRepository;
}

export interface StepPersistenceInput {
  sessionId: string;
  /** The assistant's text for this step; may be empty if the step was tool-calls only. */
  assistantText: string;
  /** Every tool call the model emitted this step, in the order it emitted them. */
  toolCalls: readonly ToolCallRequest[];
  /** The dispatch result for each of `toolCalls`, matched by `toolCallId`. */
  toolResults: readonly ToolCallResult[];
  usage: StepUsage;
}

export interface PersistedStep {
  assistantMessageId: string;
  toolMessageId: string | null;
}

/**
 * Persists everything one loop iteration produced — the assistant's
 * message, a `tool_calls` row per emitted call with its result already
 * attached, a `tool`-role message carrying the same results back into
 * the conversation, and the step's token usage — inside a single
 * transaction. Because this runs at the end of every step rather than
 * only at the end of a run, a crash or restart mid-run leaves the
 * session's messages, tool calls, and usage exactly as they stood after
 * the last step that finished; nothing is lost except whatever step was
 * still in flight.
 */
export function persistStep(
  db: Database.Database,
  repos: StepPersistenceRepositories,
  input: StepPersistenceInput,
): PersistedStep {
  const runInTransaction = db.transaction((): PersistedStep => {
    const assistantMessage = repos.messages.create({
      sessionId: input.sessionId,
      role: 'assistant',
      content: input.assistantText,
    });

    const resultsByCallId = new Map(input.toolResults.map((result) => [result.toolCallId, result]));

    for (const call of input.toolCalls) {
      const result = resultsByCallId.get(call.toolCallId);
      repos.toolCalls.create({
        messageId: assistantMessage.id,
        toolName: call.toolName,
        arguments: JSON.stringify(call.input),
        result: result ? JSON.stringify(result.ok ? result.output : result.error) : null,
        status: result ? (result.ok ? 'succeeded' : 'failed') : 'pending',
      });
    }

    let toolMessageId: string | null = null;
    if (input.toolResults.length > 0) {
      const toolMessage = repos.messages.create({
        sessionId: input.sessionId,
        role: 'tool',
        content: JSON.stringify(input.toolResults),
      });
      toolMessageId = toolMessage.id;
    }

    repos.usage.record(input.sessionId, assistantMessage.id, input.usage);

    return { assistantMessageId: assistantMessage.id, toolMessageId };
  });

  return runInTransaction();
}
