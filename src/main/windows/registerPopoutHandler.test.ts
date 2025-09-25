import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
  class MockBrowserWindow {
    id = 42;
    loadURL = vi.fn();
    loadFile = vi.fn();
    once = vi.fn();
    webContents = { on: vi.fn(), setWindowOpenHandler: vi.fn() };
    show = vi.fn();
    isDestroyed = () => false;
  }
  return {
    app: { isPackaged: false, getPath: () => '/tmp' },
    BrowserWindow: MockBrowserWindow,
    ipcMain: {
      handle: (channel: string, listener: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, listener);
      },
      __invoke: (channel: string, payload: unknown) => handlers.get(channel)?.(undefined, payload),
    },
  };
});

describe('registerPopoutHandler', () => {
  it('creates a popout window and responds with its window id', async () => {
    const { ipcMain } = await import('electron');
    const { registerPopoutHandler } = await import('./registerPopoutHandler');

    registerPopoutHandler({ isDev: false });

    const result = (await (
      ipcMain as unknown as { __invoke: (c: string, p: unknown) => Promise<unknown> }
    ).__invoke('window:popout', { panelId: 'inspector' })) as {
      ok: boolean;
      data?: { windowId: number };
    };

    expect(result.ok).toBe(true);
    expect(result.data?.windowId).toBe(42);
  });
});
