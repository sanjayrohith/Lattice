import { contextBridge, ipcRenderer } from 'electron';
import type { InvokableChannel, IpcRequest, IpcResponse } from '@shared/ipc/contracts';
import type { IpcResult } from '@shared/ipc/contracts';

/**
 * Invokes a registered main-process handler for `channel` with `payload`,
 * returning its structured result envelope. This is the *only* way the
 * renderer reaches into the main process — the raw `ipcRenderer` object is
 * never exposed, so a compromised renderer cannot register arbitrary
 * listeners or invoke arbitrary channels outside this contract.
 */
function invoke<C extends InvokableChannel>(
  channel: C,
  payload: IpcRequest<C>,
): Promise<IpcResult<IpcResponse<C>>> {
  return ipcRenderer.invoke(channel, payload) as Promise<IpcResult<IpcResponse<C>>>;
}

const electronAPI = {
  invoke,
};

export type ElectronAPI = typeof electronAPI;

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
