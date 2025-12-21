import { watch, type FSWatcher } from 'node:fs';
import type { FileIndexSnapshot } from './workspaceIndexer';
import type { ReindexPipeline } from './reindexPipeline';

export interface ReindexWatcherOptions {
  /** Milliseconds of quiet after the last filesystem event before a pass runs. */
  debounceMs?: number;
  /** Injectable for tests; defaults to `node:fs`'s `watch`. */
  watchImpl?: typeof watch;
  /** Injectable for tests; defaults to the real `setTimeout`/`clearTimeout`. */
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
}

export interface ReindexWatcher {
  /** Runs an initial pass immediately and starts watching for further changes. */
  start(): Promise<void>;
  stop(): void;
}

const DEFAULT_DEBOUNCE_MS = 500;

/**
 * Watches `workspaceRoot` for filesystem changes and debounces them into a
 * single incremental {@link ReindexPipeline.runIncrementalPass} call once
 * events go quiet for `debounceMs` — a burst of saves during an edit
 * triggers one re-index pass, not one per event. Recursive watching is
 * unavailable on some platforms, so a `recursive: true` failure falls
 * back to a root-level, non-recursive watch rather than leaving the
 * index silently stale.
 */
export function createReindexWatcher(
  workspaceRoot: string,
  pipeline: ReindexPipeline,
  options: ReindexWatcherOptions = {},
): ReindexWatcher {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const watchImpl = options.watchImpl ?? watch;
  const setTimeoutImpl = options.setTimeoutImpl ?? setTimeout;
  const clearTimeoutImpl = options.clearTimeoutImpl ?? clearTimeout;

  let snapshot: FileIndexSnapshot = {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  let watcher: FSWatcher | undefined;
  let runningPass: Promise<void> = Promise.resolve();

  function schedulePass(): void {
    if (timer) clearTimeoutImpl(timer);
    timer = setTimeoutImpl(() => {
      runningPass = runningPass.then(async () => {
        const result = await pipeline.runIncrementalPass(workspaceRoot, snapshot);
        snapshot = result.snapshot;
      });
    }, debounceMs);
  }

  return {
    async start(): Promise<void> {
      const initial = await pipeline.runIncrementalPass(workspaceRoot, snapshot);
      snapshot = initial.snapshot;

      try {
        watcher = watchImpl(workspaceRoot, { recursive: true }, () => schedulePass());
      } catch {
        watcher = watchImpl(workspaceRoot, () => schedulePass());
      }
    },
    stop(): void {
      if (timer) clearTimeoutImpl(timer);
      watcher?.close();
    },
  };
}
