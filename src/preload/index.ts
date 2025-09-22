import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  ipcContracts,
  type InvokableChannel,
  type IpcRequest,
  type IpcResponse,
} from '@shared/ipc/contracts';
import type { IpcResult } from '@shared/ipc/contracts';
import {
  ipcEventContracts,
  type IpcEventPayload,
  type SubscribableChannel,
} from '@shared/ipc/events';

function isRegisteredChannel(channel: string): channel is InvokableChannel {
  return Object.prototype.hasOwnProperty.call(ipcContracts, channel);
}

/**
 * Invokes a registered main-process handler for `channel` with `payload`,
 * returning its structured result envelope. This is the *only* way the
 * renderer reaches into the main process — the raw `ipcRenderer` object is
 * never exposed, so a compromised renderer cannot register arbitrary
 * listeners or invoke arbitrary channels outside this contract.
 *
 * The TypeScript signature already restricts `channel` to a known
 * `InvokableChannel` at compile time, but a runtime guard is kept here too:
 * a tampered or dynamically constructed call cannot smuggle an unregistered
 * channel name past the type system, so it is logged and rejected with a
 * structured `UNKNOWN_CHANNEL` error before ever reaching `ipcRenderer`.
 */
function invoke<C extends InvokableChannel>(
  channel: C,
  payload: IpcRequest<C>,
): Promise<IpcResult<IpcResponse<C>>> {
  if (!isRegisteredChannel(channel)) {
    console.error(`[preload] rejected invoke on unregistered channel: ${String(channel)}`);
    return Promise.resolve({
      ok: false,
      error: {
        code: 'UNKNOWN_CHANNEL',
        message: `channel "${String(channel)}" is not registered in the IPC contract`,
      },
    });
  }

  return ipcRenderer.invoke(channel, payload) as Promise<IpcResult<IpcResponse<C>>>;
}

/**
 * Subscribes `listener` to broadcasts on `channel`, validating each inbound
 * payload against its schema before delivery and silently dropping
 * malformed events. Returns an unsubscribe function that removes the
 * underlying `ipcRenderer` listener — call it on unmount so panel remounts
 * never accumulate duplicate listeners.
 */
function subscribe<C extends SubscribableChannel>(
  channel: C,
  listener: (payload: IpcEventPayload<C>) => void,
): () => void {
  const schema = ipcEventContracts[channel];

  const wrapped = (_event: IpcRendererEvent, rawPayload: unknown): void => {
    const parsed = schema.safeParse(rawPayload);
    if (!parsed.success) {
      console.error(`[preload] dropped malformed event on channel: ${String(channel)}`);
      return;
    }
    listener(parsed.data as IpcEventPayload<C>);
  };

  ipcRenderer.on(channel, wrapped);

  return () => {
    ipcRenderer.removeListener(channel, wrapped);
  };
}

const electronAPI = {
  invoke,
  subscribe,
};

export type ElectronAPI = typeof electronAPI;

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
