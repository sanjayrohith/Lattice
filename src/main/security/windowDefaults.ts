import type { WebPreferences } from 'electron';

/**
 * The hardened `webPreferences` baseline applied to every `BrowserWindow`
 * created by the application. These four flags are the non-negotiable
 * security invariants of the renderer sandbox:
 *
 * - `nodeIntegration: false`  — renderer code never gets direct Node access.
 * - `contextIsolation: true`  — the preload world is isolated from the page.
 * - `sandbox: true`           — the renderer process runs in the OS sandbox.
 * - `webSecurity: true`       — same-origin policy and mixed content blocking stay on.
 *
 * Any window-specific options (size, preload path, etc.) should be spread
 * alongside this object, never used to override these four fields.
 */
export const hardenedWebPreferences: Readonly<WebPreferences> = Object.freeze({
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
});
