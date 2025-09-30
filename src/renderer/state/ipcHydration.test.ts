import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultAppState } from '@shared/state/appState';
import { useAppStore } from './appStore';
import { attachIpcHydration } from './ipcHydration';

function stubElectronAPI(snapshotResult: unknown) {
  const listeners = new Map<string, (payload: unknown) => void>();
  const unsubscribe = vi.fn();

  const api = {
    invoke: vi.fn().mockResolvedValue(snapshotResult),
    subscribe: vi.fn((channel: string, listener: (payload: unknown) => void) => {
      listeners.set(channel, listener);
      return unsubscribe;
    }),
  };

  (window as unknown as { electronAPI: typeof api }).electronAPI = api;

  return {
    api,
    unsubscribe,
    emit: (channel: string, payload: unknown) => listeners.get(channel)?.(payload),
  };
}

beforeEach(() => {
  useAppStore.setState({ revision: 0, state: createDefaultAppState() });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('attachIpcHydration', () => {
  it('requests a full snapshot on attach and applies it', async () => {
    const dark = { ...createDefaultAppState(), settings: { ...createDefaultAppState().settings, theme: 'dark' as const } };
    const { api } = stubElectronAPI({ ok: true, data: { revision: 3, state: dark } });

    attachIpcHydration();
    expect(api.invoke).toHaveBeenCalledWith('state:snapshot', undefined);

    await vi.waitFor(() => expect(useAppStore.getState().revision).toBe(3));
    expect(useAppStore.getState().state.settings.theme).toBe('dark');
  });

  it('applies a broadcast whose revision is newer than the current one', async () => {
    const { emit } = stubElectronAPI({ ok: true, data: { revision: 0, state: createDefaultAppState() } });
    attachIpcHydration();

    const newer = { ...createDefaultAppState(), settings: { ...createDefaultAppState().settings, stepCap: 99 } };
    emit('state:revision', { revision: 1, state: newer });

    expect(useAppStore.getState().revision).toBe(1);
    expect(useAppStore.getState().state.settings.stepCap).toBe(99);
  });

  it('drops a broadcast whose revision is not newer than the current one', async () => {
    useAppStore.setState({ revision: 5, state: createDefaultAppState() });
    const { emit } = stubElectronAPI({ ok: true, data: { revision: 0, state: createDefaultAppState() } });
    attachIpcHydration();

    const stale = { ...createDefaultAppState(), settings: { ...createDefaultAppState().settings, stepCap: 1 } };
    emit('state:revision', { revision: 5, state: stale });
    emit('state:revision', { revision: 2, state: stale });

    expect(useAppStore.getState().revision).toBe(5);
    expect(useAppStore.getState().state.settings.stepCap).not.toBe(1);
  });

  it('drops the initial snapshot when it is not newer than the current revision', async () => {
    useAppStore.setState({ revision: 10, state: createDefaultAppState() });
    const stale = { ...createDefaultAppState(), settings: { ...createDefaultAppState().settings, stepCap: 1 } };
    stubElectronAPI({ ok: true, data: { revision: 1, state: stale } });

    attachIpcHydration();
    await Promise.resolve();
    await Promise.resolve();

    expect(useAppStore.getState().revision).toBe(10);
  });

  it('returns the underlying unsubscribe function', () => {
    const { unsubscribe } = stubElectronAPI({ ok: true, data: { revision: 0, state: createDefaultAppState() } });
    const dispose = attachIpcHydration();

    dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
