import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { hardenedWebPreferences } from '@main/security/windowDefaults';
import { applyNavigationGuards } from '@main/security/navigationGuards';
import { windowManager } from './WindowManager';

export interface PopoutWindowParams {
  panelId: string;
  params?: Record<string, unknown>;
}

export function buildRouteHash({ panelId, params }: PopoutWindowParams): string {
  const query = params ? `?${new URLSearchParams(params as Record<string, string>).toString()}` : '';
  return `#/popout/${encodeURIComponent(panelId)}${query}`;
}

/**
 * Builds a secondary `BrowserWindow` for a promoted (popped-out) panel. Uses
 * the same hardened `webPreferences` and navigation guards as the main
 * window, and loads the same renderer entry with a route hash identifying
 * which panel to mount so the renderer can pick the right component.
 */
export function createPopoutWindow(
  { panelId, params }: PopoutWindowParams,
  options: { isDev: boolean; rendererDevServerUrl?: string } = { isDev: !app.isPackaged },
): BrowserWindow {
  const window = new BrowserWindow({
    width: 900,
    height: 640,
    show: false,
    webPreferences: {
      ...hardenedWebPreferences,
      preload: join(__dirname, '../preload/index.mjs'),
    },
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  const allowedOrigins = options.rendererDevServerUrl
    ? [new URL(options.rendererDevServerUrl).origin]
    : [];
  applyNavigationGuards(window.webContents, allowedOrigins);

  const hash = buildRouteHash({ panelId, params });

  if (options.isDev && options.rendererDevServerUrl) {
    void window.loadURL(`${options.rendererDevServerUrl}${hash}`);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), { hash });
  }

  windowManager.register(window, 'popout');

  return window;
}
