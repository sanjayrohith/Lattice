import { IPC_CHANNELS } from '@shared/ipc/channels';
import { registerHandler } from '@main/ipc/registerHandler';
import { createPopoutWindow } from './createPopoutWindow';

/**
 * Wires the `window:popout` channel to `createPopoutWindow`, letting a
 * docked panel promote itself into a native window (e.g. onto a second
 * monitor) with a single renderer-initiated call.
 */
export function registerPopoutHandler(options?: {
  isDev: boolean;
  rendererDevServerUrl?: string;
}): void {
  registerHandler(IPC_CHANNELS.WINDOW_POPOUT, ({ panelId, params }) => {
    const window = createPopoutWindow({ panelId, params }, options);
    return { windowId: window.id };
  });
}
