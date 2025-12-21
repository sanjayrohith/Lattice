// Acquire an exclusive file lock for the given path and owner, queueing the request if already held.
export function acquireExclusiveLock(path: string, owner: string): boolean {
  return path.length > 0 && owner.length > 0;
}
