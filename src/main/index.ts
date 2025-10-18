import { join } from 'node:path';
import { app, BrowserWindow, safeStorage, session } from 'electron';
import { hardenedWebPreferences } from '@main/security/windowDefaults';
import { applyContentSecurityPolicy } from '@main/security/contentSecurityPolicy';
import { applyNavigationGuards } from '@main/security/navigationGuards';
import { applyPermissionPolicy } from '@main/security/permissions';
import { initializeLogger, log } from '@main/logging/logger';
import { registerLogHandler } from '@main/logging/registerLogHandler';
import { registerAppInfoHandler } from '@main/ipc/registerAppInfoHandler';
import { persistWindowBounds, resolveInitialBounds } from '@main/windows/windowState';
import { enforceSingleInstanceLock } from '@main/app/singleInstance';
import { registerLifecycleHandlers } from '@main/app/lifecycle';
import { windowManager } from '@main/windows/WindowManager';
import { registerPopoutHandler } from '@main/windows/registerPopoutHandler';
import { registerWindowControlsHandlers } from '@main/windows/registerWindowControlsHandlers';
import { registerLayoutHandlers } from '@main/layout/registerLayoutHandlers';
import { registerStateHandlers } from '@main/state/registerStateHandlers';
import { initializeDatabase } from '@main/db';
import { registerEncryptionStatusHandler } from '@main/security/registerEncryptionStatusHandler';
import { CredentialVault } from '@main/security/credentialVault';
import { registerVaultHandlers } from '@main/security/registerVaultHandlers';
import { createPreferencesStore } from '@main/settings/preferencesStore';
import { registerHealthCheckHandler } from '@main/ai/registerHealthCheckHandler';
import { RunAbortRegistry } from '@main/loop/runAbortRegistry';
import { registerRunCancelHandler } from '@main/loop/registerRunCancelHandler';

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
    frame: false,
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

  windowManager.register(window, 'main');
  const disposePersistence = persistWindowBounds(window, app.getPath('userData'), MAIN_WINDOW_KEY);
  windowManager.onClose(window.id, disposePersistence);

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
registerPopoutHandler({ isDev, ...(rendererDevServerUrl ? { rendererDevServerUrl } : {}) });
registerWindowControlsHandlers();
registerLayoutHandlers();
registerStateHandlers();
registerEncryptionStatusHandler();

const hasSingleInstanceLock = enforceSingleInstanceLock(app, () => BrowserWindow.getAllWindows()[0]);

if (hasSingleInstanceLock) {
  void app.whenReady().then(() => {
    applyContentSecurityPolicy(session.defaultSession);
    applyPermissionPolicy(session.defaultSession);
    const database = initializeDatabase(app.getPath('userData'));
    const vault = new CredentialVault(database, safeStorage);
    registerVaultHandlers(vault);
    registerHealthCheckHandler(vault.credentials);
    registerRunCancelHandler(new RunAbortRegistry());
    createPreferencesStore();

    log.info('application ready');
    createMainWindow();

    registerLifecycleHandlers(
      app,
      { createWindow: createMainWindow, getAllWindows: BrowserWindow.getAllWindows },
      () => log.info('application quitting'),
    );
  });
}
