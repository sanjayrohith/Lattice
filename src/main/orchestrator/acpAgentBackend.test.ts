import { describe, expect, it, vi } from 'vitest';
import type { AcpConnection } from '../acp/acpConnection';
import type { InternalMessage } from '../ai/messages';
import { AcpAgentBackend } from './acpAgentBackend';

function fakeConnection(): {
  connection: AcpConnection;
  emitUpdate: (params: unknown) => void;
  requestMock: ReturnType<typeof vi.fn>;
  notifyMock: ReturnType<typeof vi.fn>;
} {
  let listener: (method: string, params: unknown, respond?: (result: unknown) => void) => void = () => undefined;
  const requestMock = vi.fn();
  const notifyMock = vi.fn();

  const connection = {
    requireInitialized: vi.fn(),
    request: requestMock,
    notify: notifyMock,
    onPeerMessage: vi.fn((l: typeof listener) => {
      listener = l;
      return () => undefined;
    }),
  } as unknown as AcpConnection;

  return {
    connection,
    emitUpdate: (params: unknown) => listener('session/update', params),
    requestMock,
    notifyMock,
  };
}

const history: InternalMessage[] = [{ role: 'user', parts: [{ type: 'text', text: 'say hello' }] }];

describe('AcpAgentBackend.stream', () => {
  it('opens a session once, sends the latest user turn, and yields normalized updates', async () => {
    const { connection, emitUpdate, requestMock } = fakeConnection();
    let resolvePrompt: ((result: unknown) => void) | undefined;
    requestMock.mockImplementation((method: string) => {
      if (method === 'session/new') return Promise.resolve({ sessionId: 'sess-1' });
      if (method === 'session/prompt') {
        return new Promise((resolve) => {
          resolvePrompt = resolve;
        });
      }
      throw new Error(`unexpected method ${method}`);
    });

    const backend = new AcpAgentBackend(connection, '/workspace');
    const iterator = backend.stream({ runId: 'run-1', history })[Symbol.asyncIterator]();

    // Starts the generator: ensureSession() + subscribeSessionUpdates() + sendPrompt(),
    // which stays pending on the controlled session/prompt promise above.
    const firstNext = iterator.next();

    // Let ensureSession's session/new resolve, the update subscription register,
    // and sendPrompt actually issue session/prompt before emitting an update.
    while (!requestMock.mock.calls.some(([method]) => method === 'session/prompt')) {
      await Promise.resolve();
    }

    emitUpdate({
      sessionId: 'sess-1',
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hi' } },
    });

    const first = await firstNext;
    expect(first.value).toEqual({ type: 'text-delta', runId: 'run-1', delta: 'hi' });

    resolvePrompt?.({ stopReason: 'end_turn' });
    const done = await iterator.next();
    expect(done.done).toBe(true);

    expect(requestMock).toHaveBeenCalledWith('session/new', { cwd: '/workspace' });
    expect(requestMock).toHaveBeenCalledWith('session/prompt', {
      sessionId: 'sess-1',
      prompt: [{ type: 'text', text: 'say hello' }],
    });
  });

  it('reuses the same session across multiple stream() calls', async () => {
    const { connection, requestMock } = fakeConnection();
    let sessionNewCalls = 0;
    requestMock.mockImplementation((method: string) => {
      if (method === 'session/new') {
        sessionNewCalls += 1;
        return Promise.resolve({ sessionId: 'sess-1' });
      }
      return Promise.resolve({ stopReason: 'end_turn' });
    });

    const backend = new AcpAgentBackend(connection, '/workspace');

    const drain = async (runId: string): Promise<void> => {
      for await (const _event of backend.stream({ runId, history })) {
        // drain
      }
    };

    await drain('run-1');
    await drain('run-2');

    expect(sessionNewCalls).toBe(1);
  });

  it('cancel() notifies session/cancel for the session bound to that run', async () => {
    const { connection, notifyMock, requestMock } = fakeConnection();
    requestMock.mockImplementation((method: string) =>
      Promise.resolve(method === 'session/new' ? { sessionId: 'sess-1' } : { stopReason: 'end_turn' }),
    );

    const backend = new AcpAgentBackend(connection, '/workspace');
    for await (const _event of backend.stream({ runId: 'run-1', history })) {
      // drain
    }

    backend.cancel('run-1');
    expect(notifyMock).toHaveBeenCalledWith('session/cancel', { sessionId: 'sess-1' });
  });

  it('cancel() is a no-op for a run with no known session', () => {
    const { connection, notifyMock } = fakeConnection();
    const backend = new AcpAgentBackend(connection, '/workspace');
    expect(() => backend.cancel('unknown-run')).not.toThrow();
    expect(notifyMock).not.toHaveBeenCalled();
  });
});
