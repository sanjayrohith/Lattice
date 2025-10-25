import { describe, expect, it, vi } from 'vitest';
import type { AcpConnection } from './acpConnection';
import {
  ACP_SESSION_CANCEL_METHOD,
  cancelAndTeardownSession,
  wireCancellationOnAbort,
} from './acpCancellation';

function fakeConnection(): AcpConnection {
  return { notify: vi.fn() } as unknown as AcpConnection;
}

describe('wireCancellationOnAbort', () => {
  it('sends session/cancel when the signal fires', () => {
    const connection = fakeConnection();
    const controller = new AbortController();
    const onCancelled = vi.fn();
    wireCancellationOnAbort(connection, 'sess-1', controller.signal, onCancelled);

    controller.abort();

    expect(connection.notify).toHaveBeenCalledWith(ACP_SESSION_CANCEL_METHOD, { sessionId: 'sess-1' });
    expect(onCancelled).toHaveBeenCalledOnce();
  });

  it('sends session/cancel immediately if the signal is already aborted', () => {
    const connection = fakeConnection();
    const controller = new AbortController();
    controller.abort();
    const onCancelled = vi.fn();

    wireCancellationOnAbort(connection, 'sess-1', controller.signal, onCancelled);

    expect(connection.notify).toHaveBeenCalledWith(ACP_SESSION_CANCEL_METHOD, { sessionId: 'sess-1' });
    expect(onCancelled).toHaveBeenCalledOnce();
  });

  it('the returned cleanup function prevents a later abort from firing the handler', () => {
    const connection = fakeConnection();
    const controller = new AbortController();
    const cleanup = wireCancellationOnAbort(connection, 'sess-1', controller.signal);

    cleanup();
    controller.abort();

    expect(connection.notify).not.toHaveBeenCalled();
  });
});

describe('cancelAndTeardownSession', () => {
  it('notifies cancellation and removes the session from the registry', () => {
    const connection = fakeConnection();
    const registry = { remove: vi.fn().mockReturnValue(true) };

    cancelAndTeardownSession(connection, 'sess-1', registry);

    expect(connection.notify).toHaveBeenCalledWith(ACP_SESSION_CANCEL_METHOD, { sessionId: 'sess-1' });
    expect(registry.remove).toHaveBeenCalledWith('sess-1');
  });

  it('works without a registry', () => {
    const connection = fakeConnection();
    expect(() => cancelAndTeardownSession(connection, 'sess-1')).not.toThrow();
  });
});
