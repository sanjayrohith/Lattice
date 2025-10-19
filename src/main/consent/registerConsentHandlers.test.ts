import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();
const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: sendMock } }],
  },
  ipcMain: {
    handle: (channel: string, listener: (event: unknown, payload: unknown) => unknown) => {
      handlers.set(channel, listener);
    },
  },
}));

describe('registerConsentHandlers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sendMock.mockClear();
    handlers.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function invoke(channel: string, payload: unknown) {
    return handlers.get(channel)?.({ sender: { id: 1 } }, payload);
  }

  it('broadcasts a consent:request event to every open window', async () => {
    const { PendingDecisionRegistry } = await import('../loop/abortCleanup');
    const { registerConsentHandlers } = await import('./registerConsentHandlers');

    const pending = new PendingDecisionRegistry<'accepted' | 'declined'>();
    const notifyPending = registerConsentHandlers(pending);

    notifyPending('session-1', { toolCallId: 'c1', toolName: 'write_file', input: { path: 'a.txt' } });

    expect(sendMock).toHaveBeenCalledWith('consent:request', {
      runId: 'session-1',
      toolCallId: 'c1',
      toolName: 'write_file',
      input: { path: 'a.txt' },
    });
  });

  it('resolves a pending decision through consent:respond', async () => {
    const { PendingDecisionRegistry } = await import('../loop/abortCleanup');
    const { registerConsentHandlers } = await import('./registerConsentHandlers');

    const pending = new PendingDecisionRegistry<'accepted' | 'declined'>();
    const resolve = vi.fn();
    pending.register('c1', resolve);
    registerConsentHandlers(pending);

    const result = (await invoke('consent:respond', { toolCallId: 'c1', decision: 'accepted' })) as {
      data: { resolved: boolean };
    };

    expect(result.data.resolved).toBe(true);
    expect(resolve).toHaveBeenCalledWith('accepted');
  });

  it('defaults an unanswered request to declined after the configured timeout', async () => {
    const { PendingDecisionRegistry } = await import('../loop/abortCleanup');
    const { registerConsentHandlers } = await import('./registerConsentHandlers');

    const pending = new PendingDecisionRegistry<'accepted' | 'declined'>();
    const resolve = vi.fn();
    pending.register('c1', resolve);
    const notifyPending = registerConsentHandlers(pending, { timeoutMs: 5000 });

    notifyPending('session-1', { toolCallId: 'c1', toolName: 'write_file', input: {} });
    vi.advanceTimersByTime(5000);

    expect(resolve).toHaveBeenCalledWith('declined');
  });

  it('rejects a malformed consent:respond payload', async () => {
    const { PendingDecisionRegistry } = await import('../loop/abortCleanup');
    const { registerConsentHandlers } = await import('./registerConsentHandlers');

    registerConsentHandlers(new PendingDecisionRegistry<'accepted' | 'declined'>());

    const result = (await invoke('consent:respond', { toolCallId: '', decision: 'accepted' })) as {
      ok: boolean;
      error?: { code: string };
    };

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_PAYLOAD');
  });
});
