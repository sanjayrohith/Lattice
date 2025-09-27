import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { registerHandler, type HandlerContext } from '@main/ipc/registerHandler';

function senderWindow({ senderId }: HandlerContext): BrowserWindow | undefined {
  return BrowserWindow.fromId(senderId) ?? undefined;
}

/**
 * Registers the frameless-shell window control channels: minimize,
 * maximize/restore toggle, and close — each acting on the window that
 * invoked it rather than the currently focused window, so a popout can
 * control itself independently of the main window.
 */
export function registerWindowControlsHandlers(): void {
  registerHandler(IPC_CHANNELS.WINDOW_MINIMIZE, (_payload, context) => {
    senderWindow(context)?.minimize();
  });

  registerHandler(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE, (_payload, context) => {
    const window = senderWindow(context);
    if (!window) return;
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  });

  registerHandler(IPC_CHANNELS.WINDOW_CLOSE, (_payload, context) => {
    senderWindow(context)?.close();
  });
}
