import { useEffect } from 'react';
import type { StoreApi } from 'zustand';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { AppState } from '@shared/state/appState';
import { useAppStore, type AppStore } from './appStore';

/**
 * Wires `store`'s local projection to the main process's authoritative
 * state: requests a full snapshot immediately, then applies every
 * subsequent `state:revision` broadcast via `store.setState()`.
 *
 * Any payload — snapshot or broadcast — whose revision is not strictly
 * newer than the store's current revision is dropped. Combined with the
 * main process's single monotonic counter, this guarantees every window
 * converges on the latest state even if broadcasts arrive out of order,
 * independent of how many renderer stores are attached to the same stream.
 */
export function attachIpcHydration(store: StoreApi<AppStore> = useAppStore): () => void {
  const applyIfNewer = (revision: number, state: AppState): void => {
    const current = store.getState().revision;
    if (revision > current) {
      store.getState().setSnapshot(revision, state);
    }
  };

  const unsubscribe = window.electronAPI.subscribe(IPC_CHANNELS.STATE_REVISION, (payload) => {
    applyIfNewer(payload.revision, payload.state as AppState);
  });

  void window.electronAPI.invoke(IPC_CHANNELS.STATE_SNAPSHOT, undefined).then((result) => {
    if (result.ok) {
      applyIfNewer(result.data.revision, result.data.state as AppState);
    }
  });

  return unsubscribe;
}

/** React hook form of `attachIpcHydration`: attaches on mount, detaches on unmount. */
export function useIpcHydration(): void {
  useEffect(() => {
    return attachIpcHydration();
  }, []);
}
