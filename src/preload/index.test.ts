import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => {
  const exposed: Record<string, unknown> = {};
  return {
    contextBridge: {
      exposeInMainWorld: (key: string, api: unknown) => {
        exposed[key] = api;
      },
    },
    ipcRenderer: {
      invoke: vi.fn().mockResolvedValue({ ok: true, data: {} }),
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
