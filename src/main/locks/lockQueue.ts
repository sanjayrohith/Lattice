import {
  LockAlreadyHeldError,
  normalizeLockPath,
  type LockManager,
  type LockOwner,
  type LockRecord,
} from './lockManager';

export const DEFAULT_LOCK_WAIT_TIMEOUT_MS = 30_000;

/** Thrown when a queued lock acquisition is not granted before its timeout elapses. */
export class LockTimeoutError extends Error {
  readonly code = 'LOCK_TIMEOUT';

  constructor(
    public readonly path: string,
    public readonly timeoutMs: number,
  ) {
    super(`timed out after ${timeoutMs}ms waiting for the lock on "${path}"`);
    this.name = 'LockTimeoutError';
  }
}

/** Thrown when granting a wait would complete a cycle in the wait-for graph — a deadlock. */
export class LockDeadlockError extends Error {
  readonly code = 'LOCK_DEADLOCK';

  constructor(
    public readonly path: string,
    public readonly holder: LockOwner,
  ) {
    super(
      `waiting for the lock on "${path}" held by agent "${holder.agentId}" (run "${holder.runId}") ` +
        'would create a deadlock cycle; this newest request is failed instead of queued',
    );
    this.name = 'LockDeadlockError';
  }
}

interface Waiter {
  owner: LockOwner;
  resolve: (record: LockRecord) => void;
  reject: (error: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

function ownerKey(owner: LockOwner): string {
  return `${owner.runId}:${owner.agentId}`;
}

/**
 * Wraps a {@link LockManager} with a fair FIFO wait queue: an
 * acquisition that cannot be granted immediately waits in line for
 * its path rather than failing outright, is granted in the order it
 * queued once the path frees up, and is failed with
 * {@link LockTimeoutError} if it waits longer than its timeout. A
 * wait-for graph (waiter owner -> holder owner) is maintained
 * alongside the queue; if granting a new wait would complete a cycle
 * in that graph — a deadlock — the *newest* request (the one that
 * would complete the cycle) is failed immediately with
 * {@link LockDeadlockError} rather than queued, so a deadlock can
 * never actually form.
 */
export class LockQueue {
  private readonly waitersByPath = new Map<string, Waiter[]>();
  private readonly waitForGraph = new Map<string, Set<string>>();

  constructor(private readonly manager: LockManager) {}

  private wouldDeadlock(waiterKey: string, holderKey: string): boolean {
    if (waiterKey === holderKey) return false;

    const visited = new Set<string>();
    const stack = [holderKey];

    while (stack.length > 0) {
      const current = stack.pop() as string;
      if (current === waiterKey) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const next of this.waitForGraph.get(current) ?? []) {
        stack.push(next);
      }
    }
    return false;
  }

  private addWaitEdge(waiterKey: string, holderKey: string): void {
    const set = this.waitForGraph.get(waiterKey) ?? new Set<string>();
    set.add(holderKey);
    this.waitForGraph.set(waiterKey, set);
  }

  private clearWaitEdgesFrom(ownerKeyValue: string): void {
    this.waitForGraph.delete(ownerKeyValue);
  }

  /** Acquires `path` for `owner`, queueing FIFO behind any current holder rather than failing immediately. */
  acquire(path: string, owner: LockOwner, timeoutMs: number = DEFAULT_LOCK_WAIT_TIMEOUT_MS): Promise<LockRecord> {
    const normalizedPath = normalizeLockPath(path);

    try {
      return Promise.resolve(this.manager.acquire(normalizedPath, owner));
    } catch (error) {
      if (!(error instanceof LockAlreadyHeldError)) {
        return Promise.reject(error);
      }

      const waiterKey = ownerKey(owner);
      const holderKey = ownerKey(error.holder);

      if (this.wouldDeadlock(waiterKey, holderKey)) {
        return Promise.reject(new LockDeadlockError(normalizedPath, error.holder));
      }

      return new Promise<LockRecord>((resolve, reject) => {
        const waiter: Waiter = {
          owner,
          resolve,
          reject,
          timeoutHandle: setTimeout(() => {
            this.removeWaiter(normalizedPath, waiter);
            this.clearWaitEdgesFrom(waiterKey);
            reject(new LockTimeoutError(normalizedPath, timeoutMs));
          }, timeoutMs),
        };

        const waiters = this.waitersByPath.get(normalizedPath) ?? [];
        waiters.push(waiter);
        this.waitersByPath.set(normalizedPath, waiters);
        this.addWaitEdge(waiterKey, holderKey);
      });
    }
  }

  private removeWaiter(path: string, waiter: Waiter): void {
    const waiters = this.waitersByPath.get(path);
    if (!waiters) return;
    const index = waiters.indexOf(waiter);
    if (index !== -1) waiters.splice(index, 1);
    if (waiters.length === 0) this.waitersByPath.delete(path);
  }

  /** Releases `path` and, if released, grants it to the next FIFO waiter (if any). */
  release(path: string, owner: LockOwner): boolean {
    const normalizedPath = normalizeLockPath(path);
    const released = this.manager.release(normalizedPath, owner);
    if (!released) return false;

    this.clearWaitEdgesFrom(ownerKey(owner));
    this.grantNextWaiter(normalizedPath);
    return true;
  }

  private grantNextWaiter(path: string): void {
    const waiters = this.waitersByPath.get(path);
    const next = waiters?.shift();
    if (!next) return;

    clearTimeout(next.timeoutHandle);
    if (waiters && waiters.length === 0) this.waitersByPath.delete(path);
    this.clearWaitEdgesFrom(ownerKey(next.owner));

    try {
      next.resolve(this.manager.acquire(path, next.owner));
    } catch (error) {
      next.reject(error as Error);
      // The path is still free (the failed grant never actually held it); offer it to the next waiter in line.
      this.grantNextWaiter(path);
    }
  }

  /** The number of requests currently queued (not yet granted) for `path`. */
  waitingCount(path: string): number {
    return this.waitersByPath.get(normalizeLockPath(path))?.length ?? 0;
  }
}
