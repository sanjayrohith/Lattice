import { app } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { registerHandler } from './registerHandler';

/**
 * Registers the `app:info` handshake channel returning the app version,
 * Electron and Chromium runtime versions, host platform, and the resolved
 * `userData` path — used by the renderer for display and diagnostics.
 */
export function registerAppInfoHandler(): void {
  registerHandler(IPC_CHANNELS.APP_INFO, () => ({
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron ?? 'unknown',
    chromeVersion: process.versions.chrome ?? 'unknown',
    platform: process.platform,
    userDataPath: app.getPath('userData'),
  }));
}
