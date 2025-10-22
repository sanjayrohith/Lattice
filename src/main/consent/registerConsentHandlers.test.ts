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

  async function setup() {
    const { PendingDecisionRegistry } = await import('../loop/abortCleanup');
    const { ConsentPolicyStore } = await import('./consentPolicyStore');
    const { registerConsentHandlers } = await import('./registerConsentHandlers');

    const pending = new PendingDecisionRegistry<'accepted' | 'declined'>();
    const policyStore = new ConsentPolicyStore();
    return { pending, policyStore, registerConsentHandlers };
  }

  it('broadcasts a consent:request event to every open window', async () => {
    const { pending, policyStore, registerConsentHandlers } = await setup();
    const notifyPending = registerConsentHandlers(pending, policyStore);

    notifyPending('session-1', { toolCallId: 'c1', toolName: 'write_file', input: { path: 'a.txt' } });

    expect(sendMock).toHaveBeenCalledWith('consent:request', {
      runId: 'session-1',
      toolCallId: 'c1',
      toolName: 'write_file',
      input: { path: 'a.txt' },
    });
  });

  it('resolves accept-once as accepted, for this call only', async () => {
    const { pending, policyStore, registerConsentHandlers } = await setup();
    const resolve = vi.fn();
    pending.register('c1', resolve);
    registerConsentHandlers(pending, policyStore);

    const result = (await invoke('consent:respond', {
      runId: 's1',
      toolCallId: 'c1',
      toolName: 'write_file',
      decision: 'accept-once',
    })) as { data: { resolved: boolean } };

    expect(result.data.resolved).toBe(true);
    expect(resolve).toHaveBeenCalledWith('accepted');
    expect(policyStore.getSessionOverride('s1', 'write_file')).toBeUndefined();
  });

  it('resolves decline as declined', async () => {
    const { pending, policyStore, registerConsentHandlers } = await setup();
    const resolve = vi.fn();
    pending.register('c1', resolve);
    registerConsentHandlers(pending, policyStore);

    await invoke('consent:respond', {
      runId: 's1',
      toolCallId: 'c1',
      toolName: 'write_file',
      decision: 'decline',
    });

    expect(resolve).toHaveBeenCalledWith('declined');
  });

  it('resolves accept-always as accepted and records a session override', async () => {
    const { pending, policyStore, registerConsentHandlers } = await setup();
    const resolve = vi.fn();
    pending.register('c1', resolve);
    registerConsentHandlers(pending, policyStore);

    await invoke('consent:respond', {
      runId: 's1',
      toolCallId: 'c1',
      toolName: 'write_file',
      decision: 'accept-always',
    });

    expect(resolve).toHaveBeenCalledWith('accepted');
    expect(policyStore.getSessionOverride('s1', 'write_file')).toBe('always');
  });

  it('defaults an unanswered request to declined after the configured timeout', async () => {
    const { pending, policyStore, registerConsentHandlers } = await setup();
    const resolve = vi.fn();
    pending.register('c1', resolve);
    const notifyPending = registerConsentHandlers(pending, policyStore, { timeoutMs: 5000 });

    notifyPending('session-1', { toolCallId: 'c1', toolName: 'write_file', input: {} });
    vi.advanceTimersByTime(5000);

    expect(resolve).toHaveBeenCalledWith('declined');
  });

  it('rejects a malformed consent:respond payload', async () => {
    const { pending, policyStore, registerConsentHandlers } = await setup();
    registerConsentHandlers(pending, policyStore);

    const result = (await invoke('consent:respond', {
      runId: 's1',
      toolCallId: '',
      toolName: 'write_file',
      decision: 'accept-once',
    })) as { ok: boolean; error?: { code: string } };

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_PAYLOAD');
  });
});
