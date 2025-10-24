import { z } from 'zod';
import type { RunStreamEvent } from '@shared/ipc/events';
import type { AcpConnection } from './acpConnection';

/**
 * The shapes of `session/update` notifications an ACP agent may send
 * mid-turn: incremental message chunks, tool call lifecycle
 * transitions, and plan updates. Modeled as a discriminated union on
 * `sessionUpdate` per the protocol's own tagging.
 */
const agentMessageChunkSchema = z.object({
  sessionUpdate: z.literal('agent_message_chunk'),
  content: z.object({ type: z.literal('text'), text: z.string() }),
});

const toolCallUpdateSchema = z.object({
  sessionUpdate: z.literal('tool_call'),
  toolCallId: z.string(),
  title: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
});

const planUpdateSchema = z.object({
  sessionUpdate: z.literal('plan'),
  entries: z.array(z.object({ content: z.string(), status: z.string() })),
});

const sessionUpdateSchema = z.discriminatedUnion('sessionUpdate', [
  agentMessageChunkSchema,
  toolCallUpdateSchema,
  planUpdateSchema,
]);
export type AcpSessionUpdate = z.infer<typeof sessionUpdateSchema>;

const sessionUpdateNotificationSchema = z.object({
  sessionId: z.string(),
  update: sessionUpdateSchema,
});

/** A plan update, kept distinct from {@link RunStreamEvent} since the run stream has no plan event type yet. */
export interface AcpPlanEvent {
  type: 'plan';
  runId: string;
  entries: readonly { content: string; status: string }[];
}

export type NormalizedAcpEvent = RunStreamEvent | AcpPlanEvent;

/**
 * Normalizes one raw `session/update` notification payload into the
 * internal run event stream shape, mapping the ACP session id onto the
 * run id the rest of the application already keys everything by.
 * Returns `undefined` for a payload that fails to parse, so a decode
 * hiccup on one notification never aborts the whole stream.
 */
export function normalizeSessionUpdate(rawParams: unknown, runId: string): NormalizedAcpEvent | undefined {
  const parsed = sessionUpdateNotificationSchema.safeParse(rawParams);
  if (!parsed.success) return undefined;

  const { update } = parsed.data;
  switch (update.sessionUpdate) {
    case 'agent_message_chunk':
      return { type: 'text-delta', runId, delta: update.content.text };

    case 'tool_call':
      return update.status === 'completed' || update.status === 'failed'
        ? {
            type: 'tool-result',
            runId,
            toolCallId: update.toolCallId,
            result: { status: update.status, title: update.title },
          }
        : { type: 'tool-start', runId, toolCallId: update.toolCallId, toolName: update.title ?? 'tool' };

    case 'plan':
      return { type: 'plan', runId, entries: update.entries };
  }
}

/**
 * Subscribes to `session/update` notifications on `connection`, filters
 * to the ones for `sessionId`, normalizes them, and forwards every
 * successfully normalized event to `onEvent`. Returns the unsubscribe
 * function so the caller can tear this down when the run ends.
 */
export function subscribeSessionUpdates(
  connection: AcpConnection,
  sessionId: string,
  runId: string,
  onEvent: (event: NormalizedAcpEvent) => void,
): () => void {
  return connection.onPeerMessage((method, params) => {
    if (method !== 'session/update') return;

    const parsedEnvelope = z.object({ sessionId: z.string() }).safeParse(params);
    if (!parsedEnvelope.success || parsedEnvelope.data.sessionId !== sessionId) return;

    const event = normalizeSessionUpdate(params, runId);
    if (event) onEvent(event);
  });
}
