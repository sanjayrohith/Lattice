import { BrowserWindow, ipcMain } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { registerUpdateHandlers } from './registerUpdateHandlers';
import type { AppUpdaterLike } from './appUpdater';

vi.mock('electron', () => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
  const windows: Array<{ isDestroyed: () => boolean; webContents: { send: (...args: unknown[]) => void } }> = [];

  return {
    ipcMain: {
      handle: vi.fn((channel: string, handler: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, handler);
      }),
      _invoke: async (channel: string, payload: unknown) => {
        const handler = handlers.get(channel);
        if (!handler) throw new Error(`no handler for ${channel}`);
        return handler({ sender: { id: 1 } }, payload);
      },
    },
    BrowserWindow: {
      getAllWindows: () => windows,
      _push: (window: (typeof windows)[number]) => windows.push(window),
      _reset: () => {
        windows.length = 0;
      },
    },
  };
});

async function invoke<T>(channel: string, payload: unknown): Promise<T> {
  return (await (ipcMain as unknown as { _invoke: (c: string, p: unknown) => Promise<T> })._invoke(
    channel,
    payload,
  )) as T;
}

function fakeUpdater(): AppUpdaterLike & { emitDownloaded: (version: string) => void } {
  let listener: ((info: { version: string }) => void) | undefined;
  return {
    checkForUpdates: vi.fn().mockResolvedValue({ version: '1.2.3' }),
    downloadUpdate: vi.fn().mockResolvedValue(undefined),
    quitAndInstall: vi.fn(),
    onUpdateDownloaded: (l) => {
      listener = l;
    },
    emitDownloaded: (version) => listener?.({ version }),
  };
}

describe('registerUpdateHandlers', () => {
  beforeEach(() => {
    (BrowserWindow as unknown as { _reset: () => void })._reset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('update:check returns the update info when enabled', async () => {
    registerUpdateHandlers(fakeUpdater(), () => true);
    const result = await invoke<{ ok: true; data: { updateInfo: { version: string } | null } }>(
      IPC_CHANNELS.UPDATE_CHECK,
      undefined,
    );
    expect(result.data.updateInfo).toEqual({ version: '1.2.3' });
  });

  it('update:check returns null when disabled', async () => {
    registerUpdateHandlers(fakeUpdater(), () => false);
    const result = await invoke<{ ok: true; data: { updateInfo: null } }>(IPC_CHANNELS.UPDATE_CHECK, undefined);
    expect(result.data.updateInfo).toBeNull();
  });

  it('update:install triggers quitAndInstall', async () => {
    const updater = fakeUpdater();
    registerUpdateHandlers(updater, () => true);

    const result = await invoke<{ ok: true; data: { installing: boolean } }>(IPC_CHANNELS.UPDATE_INSTALL, undefined);

    expect(result.data.installing).toBe(true);
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('broadcasts update:available to every window when a downloaded update is ready', () => {
    const updater = fakeUpdater();
    const send = vi.fn();
    (BrowserWindow as unknown as { _push: (w: unknown) => void })._push({ isDestroyed: () => false, webContents: { send } });

    registerUpdateHandlers(updater, () => true);
    updater.emitDownloaded('2.0.0');

    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.UPDATE_AVAILABLE, { version: '2.0.0' });
  });

  it('does not broadcast when disabled at download time', () => {
    const updater = fakeUpdater();
    const send = vi.fn();
    (BrowserWindow as unknown as { _push: (w: unknown) => void })._push({ isDestroyed: () => false, webContents: { send } });

    registerUpdateHandlers(updater, () => false);
    updater.emitDownloaded('2.0.0');

    expect(send).not.toHaveBeenCalled();
  });
});
