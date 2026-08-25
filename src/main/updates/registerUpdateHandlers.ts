import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { registerHandler } from '../ipc/registerHandler';
import { UpdateController, type AppUpdaterLike } from './appUpdater';

/**
 * Registers the in-app update IPC surface: a manual check
 * (`update:check`, a no-op returning `null` when `autoUpdateEnabled` is
 * off), and `update:install` to quit and install an already-downloaded
 * update. A downloaded update — whether from a manual check or a future
 * background one — is broadcast to every window as `update:available`,
 * which is what drives the in-app prompt.
 */
export function registerUpdateHandlers(updater: AppUpdaterLike, isEnabled: () => boolean): UpdateController {
  const controller = new UpdateController(updater, {
    isEnabled,
    onUpdateReady: (info) => {
      BrowserWindow.getAllWindows().forEach((window) => {
        if (!window.isDestroyed()) {
          window.webContents.send(IPC_CHANNELS.UPDATE_AVAILABLE, info);
        }
      });
    },
  });

  registerHandler(IPC_CHANNELS.UPDATE_CHECK, async () => ({
    updateInfo: await controller.checkForUpdates(),
  }));

  registerHandler(IPC_CHANNELS.UPDATE_INSTALL, () => {
    controller.install();
    return { installing: true };
  });

  return controller;
}
