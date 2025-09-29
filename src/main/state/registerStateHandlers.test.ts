import { describe, expect, it, vi } from 'vitest';
import { MasterStore } from './masterStore';

vi.mock('electron', () => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
  const windows: Array<{ isDestroyed: () => boolean; webContents: { send: ReturnType<typeof vi.fn> } }> =
    [];
  return {
    BrowserWindow: {
      getAllWindows: () => windows,
      __addWindow: (destroyed = false) => {
        const win = { isDestroyed: () => destroyed, webContents: { send: vi.fn() } };
        windows.push(win);
        return win;
      },
      __reset: () => {
        windows.length = 0;
      },
    },
    ipcMain: {
      handle: (channel: string, listener: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, listener);
      },
      __invoke: (channel: string, payload: unknown) =>
        handlers.get(channel)?.({ sender: { id: 1 } }, payload),
    },
  };
});

describe('registerStateHandlers', () => {
  it('returns the current snapshot on state:snapshot', async () => {
    const { ipcMain } = await import('electron');
    const { registerStateHandlers } = await import('./registerStateHandlers');

    const store = new MasterStore();
    registerStateHandlers(store);

    const result = (await (
      ipcMain as unknown as { __invoke: (c: string, p: unknown) => Promise<unknown> }
    ).__invoke('state:snapshot', undefined)) as { ok: boolean; data?: { revision: number } };

    expect(result.ok).toBe(true);
    expect(result.data?.revision).toBe(0);
  });

  it('applies a valid dispatch and broadcasts the new revision to every live window', async () => {
    const { ipcMain, BrowserWindow } = await import('electron');
    (BrowserWindow as unknown as { __reset: () => void }).__reset();
    const win = (BrowserWindow as unknown as { __addWindow: () => { webContents: { send: ReturnType<typeof vi.fn> } } }).__addWindow();

    const { registerStateHandlers } = await import('./registerStateHandlers');
    const store = new MasterStore();
    registerStateHandlers(store);

    const result = (await (
      ipcMain as unknown as { __invoke: (c: string, p: unknown) => Promise<unknown> }
    ).__invoke('state:dispatch', {
      patches: [{ path: ['settings', 'theme'], value: 'dark' }],
    })) as { ok: boolean; data?: { revision: number } };

    expect(result.ok).toBe(true);
    expect(result.data?.revision).toBe(1);
    expect(store.getState().settings.theme).toBe('dark');
    expect(win.webContents.send).toHaveBeenCalledWith(
      'state:revision',
      expect.objectContaining({ revision: 1 }),
    );
  });

  it('skips broadcasting to a destroyed window', async () => {
    const { ipcMain, BrowserWindow } = await import('electron');
    (BrowserWindow as unknown as { __reset: () => void }).__reset();
    const destroyed = (
      BrowserWindow as unknown as {
        __addWindow: (d: boolean) => { webContents: { send: ReturnType<typeof vi.fn> } };
      }
    ).__addWindow(true);

    const { registerStateHandlers } = await import('./registerStateHandlers');
    const store = new MasterStore();
    registerStateHandlers(store);

    await (ipcMain as unknown as { __invoke: (c: string, p: unknown) => Promise<unknown> }).__invoke(
      'state:dispatch',
      { patches: [{ path: ['settings', 'theme'], value: 'dark' }] },
    );

    expect(destroyed.webContents.send).not.toHaveBeenCalled();
  });

  it('rejects a dispatch targeting a non-writable key with FORBIDDEN_KEY and does not mutate state', async () => {
    const { ipcMain, BrowserWindow } = await import('electron');
    (BrowserWindow as unknown as { __reset: () => void }).__reset();

    const { registerStateHandlers } = await import('./registerStateHandlers');
    const store = new MasterStore();
    registerStateHandlers(store);

    const result = (await (
      ipcMain as unknown as { __invoke: (c: string, p: unknown) => Promise<unknown> }
    ).__invoke('state:dispatch', { patches: [{ path: ['agents'], value: [] }] })) as {
      ok: boolean;
      error?: { code: string };
    };

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('FORBIDDEN_KEY');
    expect(store.getRevision()).toBe(0);
  });
});
