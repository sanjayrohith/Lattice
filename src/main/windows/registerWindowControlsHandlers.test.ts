import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
  const windows = new Map<number, unknown>();
  return {
    BrowserWindow: {
      fromId: (id: number) => windows.get(id),
      __register: (id: number, window: unknown) => windows.set(id, window),
    },
    ipcMain: {
      handle: (channel: string, listener: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, listener);
      },
      __invoke: (channel: string, senderId: number) =>
        handlers.get(channel)?.({ sender: { id: senderId } }, undefined),
    },
  };
});

describe('registerWindowControlsHandlers', () => {
  it('minimizes the window that invoked the channel', async () => {
    const { BrowserWindow, ipcMain } = await import('electron');
    const { registerWindowControlsHandlers } = await import('./registerWindowControlsHandlers');

    const minimize = vi.fn();
    (BrowserWindow as unknown as { __register: (id: number, w: unknown) => void }).__register(1, {
      minimize,
    });

    registerWindowControlsHandlers();
    await (ipcMain as unknown as { __invoke: (c: string, id: number) => Promise<unknown> }).__invoke(
      'window:minimize',
      1,
    );

    expect(minimize).toHaveBeenCalledOnce();
  });

  it('maximizes a non-maximized window on the toggle channel', async () => {
    const { BrowserWindow, ipcMain } = await import('electron');
    const { registerWindowControlsHandlers } = await import('./registerWindowControlsHandlers');

    const maximize = vi.fn();
    const unmaximize = vi.fn();
    (BrowserWindow as unknown as { __register: (id: number, w: unknown) => void }).__register(2, {
      isMaximized: () => false,
      maximize,
      unmaximize,
    });

    registerWindowControlsHandlers();
    await (ipcMain as unknown as { __invoke: (c: string, id: number) => Promise<unknown> }).__invoke(
      'window:maximize-toggle',
      2,
    );

    expect(maximize).toHaveBeenCalledOnce();
    expect(unmaximize).not.toHaveBeenCalled();
  });

  it('restores an already-maximized window on the toggle channel', async () => {
    const { BrowserWindow, ipcMain } = await import('electron');
    const { registerWindowControlsHandlers } = await import('./registerWindowControlsHandlers');

    const maximize = vi.fn();
    const unmaximize = vi.fn();
    (BrowserWindow as unknown as { __register: (id: number, w: unknown) => void }).__register(3, {
      isMaximized: () => true,
      maximize,
      unmaximize,
    });

    registerWindowControlsHandlers();
    await (ipcMain as unknown as { __invoke: (c: string, id: number) => Promise<unknown> }).__invoke(
      'window:maximize-toggle',
      3,
    );

    expect(unmaximize).toHaveBeenCalledOnce();
    expect(maximize).not.toHaveBeenCalled();
  });

  it('closes the window that invoked the close channel', async () => {
    const { BrowserWindow, ipcMain } = await import('electron');
    const { registerWindowControlsHandlers } = await import('./registerWindowControlsHandlers');

    const close = vi.fn();
    (BrowserWindow as unknown as { __register: (id: number, w: unknown) => void }).__register(4, {
      close,
    });

    registerWindowControlsHandlers();
    await (ipcMain as unknown as { __invoke: (c: string, id: number) => Promise<unknown> }).__invoke(
      'window:close',
      4,
    );

    expect(close).toHaveBeenCalledOnce();
  });

  it('does nothing when the sender window cannot be resolved', async () => {
    const { ipcMain } = await import('electron');
    const { registerWindowControlsHandlers } = await import('./registerWindowControlsHandlers');

    registerWindowControlsHandlers();

    const result = (await (
      ipcMain as unknown as { __invoke: (c: string, id: number) => Promise<unknown> }
    ).__invoke('window:close', 999)) as { ok: boolean };

    expect(result.ok).toBe(true);
  });
});
