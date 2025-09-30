import { useEffect } from 'react';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { AppState } from '@shared/state/appState';
import { useAppStore } from './appStore';

/**
 * Wires the store's local projection to the main process's authoritative
 * state: requests a full snapshot immediately, then applies every
 * subsequent `state:revision` broadcast via `store.setState()`.
 *
 * Any payload — snapshot or broadcast — whose revision is not strictly
 * newer than the store's current revision is dropped. Combined with the
 * main process's single monotonic counter, this guarantees every window
 * converges on the latest state even if broadcasts arrive out of order.
 */
export function attachIpcHydration(): () => void {
  const applyIfNewer = (revision: number, state: AppState): void => {
    const current = useAppStore.getState().revision;
    if (revision > current) {
      useAppStore.getState().setSnapshot(revision, state);
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
