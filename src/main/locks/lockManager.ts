import { resolve } from 'node:path';

export interface LockOwner {
  runId: string;
  agentId: string;
}

export interface LockRecord extends LockOwner {
  path: string;
  acquiredAt: number;
}

/**
 * Builds the descriptive, actionable message surfaced to the calling
 * agent when it loses a lock race: names exactly who holds the lock
 * and how long they have held it, then spells out the three options
 * available — queue the edit for later, switch to a different file in
 * the meantime, or wait and retry — rather than leaving the agent to
 * guess what a bare "locked" error means for what it should do next.
 */
export function describeLockContention(path: string, holder: LockRecord): string {
  const heldForSeconds = Math.max(0, Math.round((Date.now() - holder.acquiredAt) / 1000));
  return (
    `"${path}" is currently locked by agent "${holder.agentId}" (run "${holder.runId}"), ` +
    `held for ${heldForSeconds}s. Queue this edit for after the lock is released, switch to a ` +
    `different file in the meantime, or wait and retry.`
  );
}

/** Thrown by {@link LockManager.acquire} when the path is already held by a different owner. */
export class LockAlreadyHeldError extends Error {
  readonly code = 'LOCK_ALREADY_HELD';

  constructor(public readonly path: string, public readonly holder: LockRecord) {
    super(describeLockContention(path, holder));
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

  /** Releases the lock on `path` unconditionally, regardless of who holds it. For manual operator intervention only. */
  forceRelease(path: string): boolean {
    return this.locksByPath.delete(normalizeLockPath(path));
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
