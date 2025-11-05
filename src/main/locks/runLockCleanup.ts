import type { LockManager } from './lockManager';

/**
 * Releases every lock currently held by `runId`, regardless of which
 * agent within that run acquired it. Safe to call unconditionally —
 * a run holding no locks releases nothing — so every run-ending path
 * (normal completion, abort, or a crash discovered later) can call
 * this without first checking whether there is anything to clean up.
 */
export function releaseLocksForRun(manager: LockManager, runId: string): number {
  let released = 0;
  for (const lock of manager.listLocks()) {
    if (lock.runId !== runId) continue;
    if (manager.release(lock.path, { runId: lock.runId, agentId: lock.agentId })) {
      released += 1;
    }
  }
  return released;
}

/**
 * Releases every lock not held by a run in `activeRunIds` — locks
 * "orphaned" by a run that ended (or whose owning process died)
 * without ever reaching a code path that released them explicitly.
 * Intended to run once at startup against whatever set of runs the
 * application considers active immediately after initialization, so
 * a lock left over from before a crash can never permanently block a
 * path no run is actually still working on.
 */
export function reapOrphanedLocks(manager: LockManager, activeRunIds: ReadonlySet<string>): number {
  let reaped = 0;
  for (const lock of manager.listLocks()) {
    if (activeRunIds.has(lock.runId)) continue;
    if (manager.release(lock.path, { runId: lock.runId, agentId: lock.agentId })) {
      reaped += 1;
    }
  }
  return reaped;
}

/**
 * Wires a run's lifecycle to lock cleanup: `onRunEnded` — called for
 * completion, failure, abort, or a detected crash alike, since every
 * one of those means the run will never acquire or release another
 * lock again — always releases every lock that run held. Returned as
 * a coordinator object (rather than three loose functions) so a
 * caller wiring run lifecycle events has one place to attach all of
 * them from.
 */
export class RunLockCleanupCoordinator {
  constructor(private readonly manager: LockManager) {}

  /** Call when a run completes normally. */
  onRunCompleted(runId: string): number {
    return releaseLocksForRun(this.manager, runId);
  }

  /** Call when a run fails with an unrecoverable error. */
  onRunFailed(runId: string): number {
    return releaseLocksForRun(this.manager, runId);
  }

  /** Call when a run is aborted (cancelled) by the user. */
  onRunAborted(runId: string): number {
    return releaseLocksForRun(this.manager, runId);
  }

  /** Call when a run's owning process (an ACP connector) is discovered to have died. */
  onRunCrashed(runId: string): number {
    return releaseLocksForRun(this.manager, runId);
  }

  /** Call once at startup with the set of runs the application considers active. */
  reapOrphanedLocks(activeRunIds: ReadonlySet<string>): number {
    return reapOrphanedLocks(this.manager, activeRunIds);
  }
}
