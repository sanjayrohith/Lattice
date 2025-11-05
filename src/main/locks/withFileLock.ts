import type { ToolExecutionContext } from '../tools/types';

/**
 * Wraps a write-capable tool's actual disk write in lock acquisition
 * and guaranteed release: acquires an exclusive lock on `resolvedPath`
 * under `context.lockOwner` before calling `fn`, and releases it in a
 * `finally` block regardless of whether `fn` succeeds, throws, or the
 * process is interrupted mid-await — a lock must never outlive the
 * operation it was guarding. Contexts with no `locks` manager
 * configured (most unit tests, and any caller that has not opted into
 * locking) skip acquisition entirely and just run `fn` directly.
 */
export async function withFileLock<T>(
  context: ToolExecutionContext,
  resolvedPath: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!context.locks || !context.lockOwner) {
    return fn();
  }

  const { locks, lockOwner } = context;
  locks.acquire(resolvedPath, lockOwner);

  try {
    return await fn();
  } finally {
    locks.release(resolvedPath, lockOwner);
  }
}
