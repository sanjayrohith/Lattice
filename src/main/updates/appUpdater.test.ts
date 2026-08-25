import { describe, expect, it, vi } from 'vitest';
import { UpdateController, type AppUpdaterLike } from './appUpdater';

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

describe('UpdateController', () => {
  it('checks and downloads an update when enabled', async () => {
    const updater = fakeUpdater();
    const controller = new UpdateController(updater, { isEnabled: () => true, onUpdateReady: vi.fn() });

    const result = await controller.checkForUpdates();

    expect(result).toEqual({ version: '1.2.3' });
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
  });

  it('is a no-op returning null when disabled', async () => {
    const updater = fakeUpdater();
    const controller = new UpdateController(updater, { isEnabled: () => false, onUpdateReady: vi.fn() });

    const result = await controller.checkForUpdates();

    expect(result).toBeNull();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
  });

  it('does not download when no update is found', async () => {
    const updater = fakeUpdater();
    (updater.checkForUpdates as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const controller = new UpdateController(updater, { isEnabled: () => true, onUpdateReady: vi.fn() });

    const result = await controller.checkForUpdates();

    expect(result).toBeNull();
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
  });

  it('notifies onUpdateReady when a downloaded update arrives and auto-update is enabled', () => {
    const updater = fakeUpdater();
    const onUpdateReady = vi.fn();
    new UpdateController(updater, { isEnabled: () => true, onUpdateReady });

    updater.emitDownloaded('2.0.0');

    expect(onUpdateReady).toHaveBeenCalledWith({ version: '2.0.0' });
  });

  it('suppresses the ready notification when auto-update is disabled at download time', () => {
    const updater = fakeUpdater();
    const onUpdateReady = vi.fn();
    new UpdateController(updater, { isEnabled: () => false, onUpdateReady });

    updater.emitDownloaded('2.0.0');

    expect(onUpdateReady).not.toHaveBeenCalled();
  });

  it('delegates install to the underlying updater', () => {
    const updater = fakeUpdater();
    const controller = new UpdateController(updater, { isEnabled: () => true, onUpdateReady: vi.fn() });

    controller.install();

    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });
});
