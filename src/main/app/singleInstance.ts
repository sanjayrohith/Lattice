import type { App, BrowserWindow } from 'electron';

/**
 * Requests the OS-level single instance lock. If another instance already
 * holds it, this instance quits immediately and returns `false`. Otherwise
 * a `second-instance` handler is installed that restores and focuses
 * `getExistingWindow()`'s result instead of letting a duplicate process
 * spin up a second window.
 */
export function enforceSingleInstanceLock(
  app: App,
  getExistingWindow: () => BrowserWindow | undefined,
): boolean {
  const acquired = app.requestSingleInstanceLock();

  if (!acquired) {
    app.quit();
    return false;
  }

  app.on('second-instance', () => {
    const existingWindow = getExistingWindow();
    if (!existingWindow) return;
    if (existingWindow.isMinimized()) existingWindow.restore();
    existingWindow.focus();
  });

  return true;
}
