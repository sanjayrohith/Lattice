import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultAppState, type AppState } from '@shared/state/appState';
import { createAppStore } from './appStore';
import { attachIpcHydration } from './ipcHydration';

afterEach(() => {
  vi.restoreAllMocks();
});

function stateWithStepCap(stepCap: number): AppState {
  const base = createDefaultAppState();
  return { ...base, settings: { ...base.settings, stepCap } };
}

/**
 * Simulates a single shared main-process broadcast stream fanning out to
 * however many renderer "windows" attach to it, mirroring
 * `BrowserWindow.getAllWindows().forEach(w => w.webContents.send(...))`.
 */
function createFakeMainProcessBroadcaster(initialSnapshot: { revision: number; state: AppState }) {
  const subscribers: Array<(payload: { revision: number; state: AppState }) => void> = [];

  return {
    /** Wires a renderer's `window.electronAPI` to this shared broadcast stream. */
    connectRenderer(): void {
      const api = {
        invoke: vi.fn().mockResolvedValue({ ok: true, data: initialSnapshot }),
        subscribe: vi.fn(
          (_channel: string, listener: (payload: { revision: number; state: AppState }) => void) => {
            subscribers.push(listener);
            return () => {
              const index = subscribers.indexOf(listener);
              if (index >= 0) subscribers.splice(index, 1);
            };
          },
        ),
      };
      (window as unknown as { electronAPI: typeof api }).electronAPI = api;
    },
    broadcast(revision: number, state: AppState): void {
      for (const listener of subscribers) {
        listener({ revision, state });
      }
    },
  };
}

describe('multi-window state convergence', () => {
  it('converges two independently attached renderer stores on the latest revision despite out-of-order delivery', async () => {
    const broadcaster = createFakeMainProcessBroadcaster({
      revision: 0,
      state: createDefaultAppState(),
    });

    // "Window A" attaches first.
    broadcaster.connectRenderer();
    const windowAStore = createAppStore();
    attachIpcHydration(windowAStore);
    await Promise.resolve();
    await Promise.resolve();

    // "Window B" attaches second, sharing the same broadcast stream.
    broadcaster.connectRenderer();
    const windowBStore = createAppStore();
    attachIpcHydration(windowBStore);
    await Promise.resolve();
    await Promise.resolve();

    // Revisions arrive out of order: 3 lands before 2, and 1 arrives last.
    broadcaster.broadcast(3, stateWithStepCap(30));
    broadcaster.broadcast(2, stateWithStepCap(20));
    broadcaster.broadcast(1, stateWithStepCap(10));

    for (const store of [windowAStore, windowBStore]) {
      expect(store.getState().revision).toBe(3);
      expect(store.getState().state.settings.stepCap).toBe(30);
    }
  });

  it('discards a stale payload on every attached store, not just the first', async () => {
    const broadcaster = createFakeMainProcessBroadcaster({
      revision: 0,
      state: createDefaultAppState(),
    });

    broadcaster.connectRenderer();
    const storeA = createAppStore();
    attachIpcHydration(storeA);

    broadcaster.connectRenderer();
    const storeB = createAppStore();
    attachIpcHydration(storeB);

    await Promise.resolve();
    await Promise.resolve();

    broadcaster.broadcast(5, stateWithStepCap(50));
    broadcaster.broadcast(4, stateWithStepCap(40)); // stale relative to 5

    for (const store of [storeA, storeB]) {
      expect(store.getState().revision).toBe(5);
      expect(store.getState().state.settings.stepCap).toBe(50);
    }
  });

  it('each store ignores a snapshot older than what it already converged on', async () => {
    const broadcaster = createFakeMainProcessBroadcaster({
      revision: 7,
      state: stateWithStepCap(70),
    });

    broadcaster.connectRenderer();
    const store = createAppStore();
    store.getState().setSnapshot(9, stateWithStepCap(90));

    attachIpcHydration(store);
    await Promise.resolve();
    await Promise.resolve();

    // The "late" snapshot fetch (revision 7) must not clobber the already-newer local state (9).
    expect(store.getState().revision).toBe(9);
    expect(store.getState().state.settings.stepCap).toBe(90);
  });
});
