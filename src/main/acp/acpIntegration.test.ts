import { describe, expect, it } from 'vitest';
import { AcpConnection } from './acpConnection';
import { createAcpSession } from './acpSession';
import { sendPrompt, textBlock } from './acpPrompt';
import { subscribeSessionUpdates, type NormalizedAcpEvent } from './acpSessionUpdate';
import { wireCancellationOnAbort } from './acpCancellation';
import { StdioAcpTransport } from './stdioAcpTransport';
import { MOCK_ACP_AGENT_SCRIPT } from './mockAcpAgent';

function waitFor<T>(collect: () => T | undefined, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = (): void => {
      const value = collect();
      if (value !== undefined) {
        resolve(value);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('timed out waiting for condition'));
        return;
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

describe('ACP end-to-end against the mock agent', () => {
  it('completes initialize, session creation, prompt, and streaming updates', async () => {
    const transport = new StdioAcpTransport({ command: process.execPath, args: ['-e', MOCK_ACP_AGENT_SCRIPT] });
    const connection = new AcpConnection(transport);

    const capabilities = await connection.initialize();
    expect(capabilities).toEqual({ loadSession: true });

    const session = await createAcpSession(connection, '/workspace');
    expect(session.sessionId).toBe('mock-session-1');

    const events: NormalizedAcpEvent[] = [];
    const unsubscribe = subscribeSessionUpdates(connection, session.sessionId, 'run-1', (event) => {
      events.push(event);
    });

    const result = await sendPrompt(connection, {
      sessionId: session.sessionId,
      content: [textBlock('say hello')],
    });

    expect(result).toEqual({ stopReason: 'end_turn' });
    expect(events).toEqual([
      { type: 'text-delta', runId: 'run-1', delta: 'Hello, ' },
      { type: 'text-delta', runId: 'run-1', delta: 'world!' },
      {
        type: 'tool-result',
        runId: 'run-1',
        toolCallId: 'tc-1',
        result: { status: 'completed', title: 'read_file' },
      },
    ]);

    unsubscribe();
    connection.close();
  });

  it('cancels a prompt in flight and stops further streamed updates', async () => {
    const transport = new StdioAcpTransport({ command: process.execPath, args: ['-e', MOCK_ACP_AGENT_SCRIPT] });
    const connection = new AcpConnection(transport);
    await connection.initialize();
    const session = await createAcpSession(connection, '/workspace');

    const events: NormalizedAcpEvent[] = [];
    subscribeSessionUpdates(connection, session.sessionId, 'run-2', (event) => events.push(event));

    const controller = new AbortController();
    wireCancellationOnAbort(connection, session.sessionId, controller.signal);

    // Fire the prompt, but don't await its result — the mock agent only
    // replies after a delayed second chunk, which cancellation preempts,
    // leaving this request permanently pending until the connection closes.
    sendPrompt(connection, { sessionId: session.sessionId, content: [textBlock('say hello')] }).catch(() => undefined);

    await waitFor(() => events.find((e) => e.type === 'text-delta'));
    controller.abort();

    // Give the mock agent's timer a chance to fire (and be suppressed by cancellation).
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(events).toEqual([{ type: 'text-delta', runId: 'run-2', delta: 'Hello, ' }]);

    connection.close();
  });
});
