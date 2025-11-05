import { resolve } from 'node:path';

export interface LockOwner {
  runId: string;
  agentId: string;
}

export interface LockRecord extends LockOwner {
  path: string;
  acquiredAt: number;
}

/** Thrown by {@link LockManager.acquire} when the path is already held by a different owner. */
export class LockAlreadyHeldError extends Error {
  readonly code = 'LOCK_ALREADY_HELD';

  constructor(public readonly path: string, public readonly holder: LockRecord) {
    super(`"${path}" is already locked by agent "${holder.agentId}" (run "${holder.runId}")`);
    this.name = 'LockAlreadyHeldError';
  }
}

/** Normalizes a path to its absolute, resolved form so `./a` and `a` and `/root/a` all key the same lock. */
export function normalizeLockPath(path: string): string {
  return resolve(path);
}

/**
 * Grants exclusive locks on workspace file paths, keyed by their
 * normalized absolute form, and records which run and agent holds
 * each one. A path can have at most one holder at a time; acquiring an
 * already-held path throws rather than silently granting a second
 * lock, since two concurrent writers to the same file is exactly what
 * this manager exists to prevent. Re-acquiring a path already held by
 * the *same* owner is idempotent, refreshing nothing and simply
 * confirming ownership, so a single agent's own sequential writes to a
 * file it already holds never self-deadlock.
 */
export class LockManager {
  private readonly locksByPath = new Map<string, LockRecord>();

  acquire(path: string, owner: LockOwner): LockRecord {
    const normalizedPath = normalizeLockPath(path);
    const existing = this.locksByPath.get(normalizedPath);

    if (existing) {
      if (existing.runId === owner.runId && existing.agentId === owner.agentId) {
        return existing;
      }
      throw new LockAlreadyHeldError(normalizedPath, existing);
    }

    const record: LockRecord = { path: normalizedPath, ...owner, acquiredAt: Date.now() };
    this.locksByPath.set(normalizedPath, record);
    return record;
  }

  /** Releases the lock on `path` if held by `owner`; returns `false` for no lock, or a lock held by someone else. */
  release(path: string, owner: LockOwner): boolean {
    const normalizedPath = normalizeLockPath(path);
    const existing = this.locksByPath.get(normalizedPath);
    if (!existing || existing.runId !== owner.runId || existing.agentId !== owner.agentId) {
      return false;
    }
    this.locksByPath.delete(normalizedPath);
    return true;
  }

  isLocked(path: string): boolean {
    return this.locksByPath.has(normalizeLockPath(path));
  }

  getLock(path: string): LockRecord | undefined {
    return this.locksByPath.get(normalizeLockPath(path));
  }

  listLocks(): LockRecord[] {
    return [...this.locksByPath.values()];
  }
}
