import { join } from 'node:path';
import { app, BrowserWindow, session } from 'electron';
import { hardenedWebPreferences } from '@main/security/windowDefaults';
import { applyContentSecurityPolicy } from '@main/security/contentSecurityPolicy';
import { applyNavigationGuards } from '@main/security/navigationGuards';
import { applyPermissionPolicy } from '@main/security/permissions';
import { initializeLogger, log } from '@main/logging/logger';
import { registerLogHandler } from '@main/logging/registerLogHandler';
import { registerAppInfoHandler } from '@main/ipc/registerAppInfoHandler';
import { persistWindowBounds, resolveInitialBounds } from '@main/windows/windowState';
import { enforceSingleInstanceLock } from '@main/app/singleInstance';

const MAIN_WINDOW_KEY = 'main';

const isDev = !app.isPackaged;
const rendererDevServerUrl = process.env['ELECTRON_RENDERER_URL'];

function createMainWindow(): BrowserWindow {
  const bounds = resolveInitialBounds(app.getPath('userData'), MAIN_WINDOW_KEY);

  const window = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    show: false,
    webPreferences: {
      ...hardenedWebPreferences,
      preload: join(__dirname, '../preload/index.mjs'),
    },
  });

  if (bounds.isMaximized) {
    window.maximize();
  }

  window.once('ready-to-show', () => {
    window.show();
  });

  persistWindowBounds(window, app.getPath('userData'), MAIN_WINDOW_KEY);

  const allowedOrigins = rendererDevServerUrl ? [new URL(rendererDevServerUrl).origin] : [];
  applyNavigationGuards(window.webContents, allowedOrigins);

  if (isDev && rendererDevServerUrl) {
    void window.loadURL(rendererDevServerUrl);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return window;
}

initializeLogger();
registerLogHandler();
registerAppInfoHandler();

const hasSingleInstanceLock = enforceSingleInstanceLock(app, () => BrowserWindow.getAllWindows()[0]);

if (hasSingleInstanceLock) {
  void app.whenReady().then(() => {
    applyContentSecurityPolicy(session.defaultSession);
    applyPermissionPolicy(session.defaultSession);

    log.info('application ready');
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });
}
