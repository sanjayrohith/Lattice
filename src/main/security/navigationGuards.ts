import { URL } from 'node:url';
import type { WebContents } from 'electron';

/**
 * Origins the renderer is permitted to navigate to. In development this
 * includes the Vite dev server; in production only `file://` loads of the
 * packaged renderer are allowed.
 */
export function isAllowedNavigationTarget(targetUrl: string, allowedOrigins: readonly string[]): boolean {
  try {
    const target = new URL(targetUrl);
    if (target.protocol === 'file:') {
      return true;
    }
    return allowedOrigins.includes(target.origin);
  } catch {
    return false;
  }
}

/**
 * Registers `will-navigate`, `will-attach-webview`, and window-open handlers
 * on the given `webContents` that:
 *
 * - Block navigation to any origin outside `allowedOrigins`.
 * - Deny attaching `<webview>` tags entirely (no embedded arbitrary content).
 * - Deny every renderer-initiated `window.open` call, since new windows are
 *   only ever created explicitly by the main process (see popout windows).
 */
export function applyNavigationGuards(
  contents: WebContents,
  allowedOrigins: readonly string[] = [],
): void {
  contents.on('will-navigate', (event, targetUrl) => {
    if (!isAllowedNavigationTarget(targetUrl, allowedOrigins)) {
      event.preventDefault();
    }
  });

  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
}
