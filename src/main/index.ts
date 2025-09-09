import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { hardenedWebPreferences } from '@main/security/windowDefaults';

const isDev = !app.isPackaged;
const rendererDevServerUrl = process.env['ELECTRON_RENDERER_URL'];

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      ...hardenedWebPreferences,
      preload: join(__dirname, '../preload/index.mjs'),
    },
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  if (isDev && rendererDevServerUrl) {
    void window.loadURL(rendererDevServerUrl);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return window;
}

void app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});
