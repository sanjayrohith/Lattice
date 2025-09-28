import { appStateSchema, createDefaultAppState, type AppState } from '@shared/state/appState';

export interface AppStateRevision {
  revision: number;
  state: AppState;
}

/**
 * The authoritative, single source of truth for application state, held
 * exclusively in the main process. Every renderer's local store is strictly
 * a read-only projection of what lives here (see `src/renderer/state`).
 *
 * Every mutation increments a monotonic numeric revision so renderers can
 * detect and discard stale, out-of-order broadcasts.
 */
export class MasterStore {
  private state: AppState;
  private revision = 0;

  constructor(initialState: AppState = createDefaultAppState()) {
    this.state = appStateSchema.parse(initialState);
  }

  getState(): AppState {
    return this.state;
  }

  getRevision(): number {
    return this.revision;
  }

  getSnapshot(): AppStateRevision {
    return { revision: this.revision, state: this.state };
  }

  /**
   * Replaces the state with the result of `updater(currentState)` and
   * increments the revision. `updater` must return a new object rather than
   * mutating `currentState` in place.
   */
  setState(updater: (current: AppState) => AppState): AppStateRevision {
    const next = appStateSchema.parse(updater(this.state));
    this.state = next;
    this.revision += 1;
    return this.getSnapshot();
  }
}

/** Process-wide singleton; there is exactly one authoritative state tree per app instance. */
export const masterStore = new MasterStore();
