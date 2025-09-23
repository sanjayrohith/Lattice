import type { App, BrowserWindow } from 'electron';

export interface LifecycleHooks {
  /** Creates and returns a new main window. */
  createWindow: () => BrowserWindow;
  /** Returns every currently live window. */
  getAllWindows: () => BrowserWindow[];
}

/**
 * Wires the three cross-platform lifecycle events with correct
 * macOS-versus-Windows/Linux quit semantics:
 *
 * - `window-all-closed`: quits the app everywhere except macOS, where
 *   convention keeps the process (and its menu bar) alive with no windows.
 * - `activate`: on macOS, clicking the dock icon with no open windows
 *   should open a new one; harmless no-op elsewhere since it only fires
 *   there in practice.
 * - `before-quit`: a single hook point for any last-moment cleanup, run
 *   regardless of platform.
 */
export function registerLifecycleHandlers(
  app: App,
  { createWindow, getAllWindows }: LifecycleHooks,
  onBeforeQuit?: () => void,
): void {
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on('before-quit', () => {
    onBeforeQuit?.();
  });
}
