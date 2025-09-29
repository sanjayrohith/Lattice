import { create } from 'zustand';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { createDefaultAppState, type AppState } from '@shared/state/appState';

export interface StatePatch {
  path: (string | number)[];
  value: unknown;
}

export interface AppStore {
  revision: number;
  state: AppState;
  /**
   * Applies `patches` by dispatching them to the main process over IPC and
   * awaiting the result. This never mutates `state` locally — the store is
   * strictly a projection of whatever the main process broadcasts back (see
   * the IPC hydration middleware), so every window converges on the same
   * authoritative state instead of drifting from independent local writes.
   */
  dispatch: (patches: StatePatch[]) => Promise<void>;
  /** Internal setter used by the hydration middleware to apply an incoming broadcast or snapshot. */
  setSnapshot: (revision: number, state: AppState) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  revision: 0,
  state: createDefaultAppState(),

  dispatch: async (patches) => {
    const result = await window.electronAPI.invoke(IPC_CHANNELS.STATE_DISPATCH, { patches });
    if (!result.ok) {
      throw new Error(`state dispatch failed: ${result.error.code} ${result.error.message}`);
    }
  },

  setSnapshot: (revision, state) => {
    set({ revision, state });
  },
}));
