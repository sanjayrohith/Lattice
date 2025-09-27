import { app } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { registerHandler } from '@main/ipc/registerHandler';
import { loadLayout, saveLayout } from './layoutStorage';

/**
 * Registers `layout:save` and `layout:load`, persisting the serialized
 * Dockview layout JSON to disk under `userData/layouts/<workspaceId>.json`.
 */
export function registerLayoutHandlers(): void {
  registerHandler(IPC_CHANNELS.LAYOUT_SAVE, ({ workspaceId, layout }) => {
    saveLayout(app.getPath('userData'), workspaceId, layout);
  });

  registerHandler(IPC_CHANNELS.LAYOUT_LOAD, ({ workspaceId }) => ({
    layout: loadLayout(app.getPath('userData'), workspaceId),
  }));
}
