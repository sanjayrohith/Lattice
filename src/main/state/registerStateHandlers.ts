import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { registerHandler, HandlerError } from '@main/ipc/registerHandler';
import { masterStore, type MasterStore } from './masterStore';
import { applyPatches, validatePatches } from './patchValidator';

/**
 * Registers the write path (`state:dispatch`) and read path
 * (`state:snapshot`) for the shared application state.
 *
 * A successful dispatch broadcasts the new revision and full state to every
 * window via `webContents.send`, so every renderer's local projection stays
 * in sync without polling.
 */
export function registerStateHandlers(store: MasterStore = masterStore): void {
  registerHandler(IPC_CHANNELS.STATE_SNAPSHOT, () => store.getSnapshot());

  registerHandler(IPC_CHANNELS.STATE_DISPATCH, ({ patches }) => {
    const rejection = validatePatches(patches);
    if (rejection) {
      throw new HandlerError(rejection.code, rejection.message);
    }

    const snapshot = store.setState((current) => applyPatches(current, patches));

    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.STATE_REVISION, snapshot);
      }
    });

    return { revision: snapshot.revision };
  });
}
