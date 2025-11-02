import type { RunStreamEvent } from '@shared/ipc/events';
import type { AcpConnection } from '../acp/acpConnection';
import { createAcpSession } from '../acp/acpSession';
import { sendPrompt, textBlock } from '../acp/acpPrompt';
import { normalizeSessionUpdate, subscribeSessionUpdates } from '../acp/acpSessionUpdate';
import { wireCancellationOnAbort } from '../acp/acpCancellation';
import type { InternalMessage } from '../ai/messages';
import type { AgentBackend, AgentBackendRunParams } from './agentBackend';

function lastUserText(history: readonly InternalMessage[]): string {
  const lastUser = [...history].reverse().find((message) => message.role === 'user');
  if (!lastUser) return '';
  return lastUser.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

/**
 * Drives an {@link AgentBackend} turn through an ACP connection: opens a
 * session bound to `workspaceDirectory` on first use, sends the latest
 * user turn as a prompt, and yields every normalized `session/update`
 * event until the prompt settles. Tool execution for ACP agents happens
 * entirely on the peer's side of the wire — the client only ever serves
 * the peer's filesystem/permission callbacks (`acpFsMethods.ts`,
 * `acpPermissionBridge.ts`) — so unlike {@link SdkAgentBackend} this
 * backend's `tool-result` events come directly from the peer's own
 * `session/update` stream rather than the orchestrator's dispatch loop.
 */
export class AcpAgentBackend implements AgentBackend {
  private readonly sessionIdByRun = new Map<string, string>();
  private sessionPromise: Promise<string> | undefined;

  constructor(
    private readonly connection: AcpConnection,
    private readonly workspaceDirectory: string,
  ) {}

  private async ensureSession(): Promise<string> {
    if (!this.sessionPromise) {
      this.sessionPromise = createAcpSession(this.connection, this.workspaceDirectory).then(
        (session) => session.sessionId,
      );
    }
    return this.sessionPromise;
  }

  async *stream(params: AgentBackendRunParams): AsyncIterable<RunStreamEvent> {
    const sessionId = await this.ensureSession();
    this.sessionIdByRun.set(params.runId, sessionId);

    const queue: RunStreamEvent[] = [];
    let resolveNext: (() => void) | undefined;
    let settled = false;

    const unsubscribe = subscribeSessionUpdates(this.connection, sessionId, params.runId, (event) => {
      if (event.type === 'plan') return; // no run-stream slot for plan events yet.
      queue.push(event);
      resolveNext?.();
    });

    const unwireCancel = params.signal
      ? wireCancellationOnAbort(this.connection, sessionId, params.signal)
      : () => undefined;

    const promptDone = sendPrompt(this.connection, {
      sessionId,
      content: [textBlock(lastUserText(params.history))],
    })
      .catch(() => undefined)
      .finally(() => {
        settled = true;
        resolveNext?.();
      });

    try {
      while (true) {
        if (queue.length > 0) {
          yield queue.shift() as RunStreamEvent;
          continue;
        }
        if (settled) break;

        await new Promise<void>((resolve) => {
          resolveNext = resolve;
        });
      }
    } finally {
      unsubscribe();
      unwireCancel();
      await promptDone;
    }
  }

  cancel(runId: string): void {
    const sessionId = this.sessionIdByRun.get(runId);
    if (!sessionId) return;
    this.connection.notify('session/cancel', { sessionId });
  }
}

// Re-exported so a caller normalizing a raw update outside the class
// (e.g. for logging) uses the exact same mapping this backend relies on.
export { normalizeSessionUpdate };
