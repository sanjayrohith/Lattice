import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => {
  const exposed: Record<string, unknown> = {};
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    contextBridge: {
      exposeInMainWorld: (key: string, api: unknown) => {
        exposed[key] = api;
      },
    },
    ipcRenderer: {
      invoke: vi.fn().mockResolvedValue({ ok: true, data: {} }),
      on: (channel: string, listener: (...args: unknown[]) => void) => {
        if (!listeners.has(channel)) listeners.set(channel, new Set());
        listeners.get(channel)?.add(listener);
      },
      removeListener: (channel: string, listener: (...args: unknown[]) => void) => {
        listeners.get(channel)?.delete(listener);
      },
      __emit: (channel: string, payload: unknown) => {
        for (const listener of listeners.get(channel) ?? []) {
          listener(undefined, payload);
        }
      },
      __listenerCount: (channel: string) => listeners.get(channel)?.size ?? 0,
    },
    __exposed: exposed,
  };
});

describe('preload electronAPI.invoke', () => {
  it('rejects an unregistered channel without reaching ipcRenderer', async () => {
    const electron = await import('electron');
    await import('./index');

    const exposed = (electron as unknown as { __exposed: Record<string, unknown> }).__exposed;
    const api = exposed['electronAPI'] as {
      invoke: (channel: string, payload: unknown) => Promise<unknown>;
    };

    const result = (await api.invoke('not:a:real:channel', undefined)) as {
      ok: boolean;
      error?: { code: string };
    };

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('UNKNOWN_CHANNEL');
    expect(electron.ipcRenderer.invoke).not.toHaveBeenCalled();
  });

  it('forwards a registered channel to ipcRenderer.invoke', async () => {
    const electron = await import('electron');
    await import('./index');

    const exposed = (electron as unknown as { __exposed: Record<string, unknown> }).__exposed;
    const api = exposed['electronAPI'] as {
      invoke: (channel: string, payload: unknown) => Promise<unknown>;
    };

    await api.invoke('app:info', undefined);

    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith('app:info', undefined);
  });
});

describe('preload electronAPI.subscribe', () => {
  it('delivers validated broadcast payloads to the listener', async () => {
    const electron = await import('electron');
    await import('./index');

    const exposed = (electron as unknown as { __exposed: Record<string, unknown> }).__exposed;
    const api = exposed['electronAPI'] as {
      subscribe: (channel: string, listener: (payload: unknown) => void) => () => void;
    };

    const received: unknown[] = [];
    const unsubscribe = api.subscribe('state:revision', (payload) => received.push(payload));

    (
      electron.ipcRenderer as unknown as { __emit: (c: string, p: unknown) => void }
    ).__emit('state:revision', { revision: 1, state: {} });

    expect(received).toEqual([{ revision: 1, state: {} }]);
    unsubscribe();
  });

  it('drops a malformed broadcast payload instead of delivering it', async () => {
    const electron = await import('electron');
    await import('./index');

    const exposed = (electron as unknown as { __exposed: Record<string, unknown> }).__exposed;
    const api = exposed['electronAPI'] as {
      subscribe: (channel: string, listener: (payload: unknown) => void) => () => void;
    };

    const received: unknown[] = [];
    const unsubscribe = api.subscribe('state:revision', (payload) => received.push(payload));

    (
      electron.ipcRenderer as unknown as { __emit: (c: string, p: unknown) => void }
    ).__emit('state:revision', { revision: 'not-a-number' });

    expect(received).toEqual([]);
    unsubscribe();
  });

  it('removes the underlying listener when unsubscribe is called, preventing leaks', async () => {
    const electron = await import('electron');
    await import('./index');

    const exposed = (electron as unknown as { __exposed: Record<string, unknown> }).__exposed;
    const api = exposed['electronAPI'] as {
      subscribe: (channel: string, listener: (payload: unknown) => void) => () => void;
    };

    const unsubscribe = api.subscribe('state:revision', () => {});
    const countAfterSubscribe = (
      electron.ipcRenderer as unknown as { __listenerCount: (c: string) => number }
    ).__listenerCount('state:revision');
    expect(countAfterSubscribe).toBeGreaterThan(0);

    unsubscribe();
    const countAfterUnsubscribe = (
      electron.ipcRenderer as unknown as { __listenerCount: (c: string) => number }
    ).__listenerCount('state:revision');
    expect(countAfterUnsubscribe).toBe(countAfterSubscribe - 1);
  });
});
