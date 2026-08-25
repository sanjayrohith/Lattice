export interface UpdateInfo {
  version: string;
}

/**
 * The subset of `electron-updater`'s `autoUpdater` this module depends
 * on, so {@link UpdateController} can be unit tested against a fake
 * without touching a real update feed.
 */
export interface AppUpdaterLike {
  checkForUpdates(): Promise<UpdateInfo | null>;
  downloadUpdate(): Promise<void>;
  quitAndInstall(): void;
  onUpdateDownloaded(listener: (info: UpdateInfo) => void): void;
}

/** Wraps `electron-updater`'s singleton `autoUpdater` behind {@link AppUpdaterLike}. */
export async function createElectronAppUpdater(): Promise<AppUpdaterLike> {
  // Imported lazily so this module (and anything that merely imports
  // `UpdateController`, e.g. tests) never pulls in `electron-updater`'s
  // real singleton, which reaches for `app` at import time.
  const { autoUpdater } = await import('electron-updater');

  return {
    async checkForUpdates(): Promise<UpdateInfo | null> {
      const result = await autoUpdater.checkForUpdates();
      return result?.updateInfo ? { version: result.updateInfo.version } : null;
    },
    async downloadUpdate(): Promise<void> {
      await autoUpdater.downloadUpdate();
    },
    quitAndInstall(): void {
      autoUpdater.quitAndInstall();
    },
    onUpdateDownloaded(listener: (info: UpdateInfo) => void): void {
      autoUpdater.on('update-downloaded', (info: { version: string }) => listener({ version: info.version }));
    },
  };
}

export interface UpdateControllerOptions {
  /** Whether the user has enabled auto-update, re-evaluated on every call — not cached at construction. */
  isEnabled: () => boolean;
  /** Called once a downloaded update is ready to install, only if `isEnabled()` at the time it downloaded. */
  onUpdateReady: (info: UpdateInfo) => void;
}

/**
 * Gates every update operation behind {@link UpdateControllerOptions.isEnabled}
 * — the `autoUpdateEnabled` preference. With it off, `checkForUpdates` is
 * a no-op and a downloaded update never triggers the in-app prompt, even
 * if a check was already in flight when the preference was toggled off.
 */
export class UpdateController {
  constructor(
    private readonly updater: AppUpdaterLike,
    private readonly options: UpdateControllerOptions,
  ) {
    this.updater.onUpdateDownloaded((info) => {
      if (this.options.isEnabled()) this.options.onUpdateReady(info);
    });
  }

  /** Checks for and, if found, downloads an update — a no-op returning `null` when auto-update is disabled. */
  async checkForUpdates(): Promise<UpdateInfo | null> {
    if (!this.options.isEnabled()) return null;

    const info = await this.updater.checkForUpdates();
    if (info) await this.updater.downloadUpdate();
    return info;
  }

  /** Quits and installs the already-downloaded update; the renderer calls this from the in-app prompt. */
  install(): void {
    this.updater.quitAndInstall();
  }
}
