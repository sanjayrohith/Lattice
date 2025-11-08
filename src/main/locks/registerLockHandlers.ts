import { IPC_CHANNELS } from '@shared/ipc/channels';
import { registerHandler } from '../ipc/registerHandler';
import type { LockManager } from './lockManager';

/**
 * Registers the read-only lock listing IPC channel the locks inspector
 * panel polls, plus a manual force-release channel for operator
 * intervention when a lock is stuck (its owning run crashed without
 * ever reaching the crash-cleanup path, or an agent is simply taking
 * unreasonably long). Force-release bypasses ownership entirely by
 * design — that is the whole point of a manual override.
 */
export function registerLockHandlers(manager: LockManager): void {
  registerHandler(IPC_CHANNELS.LOCKS_LIST, () => ({
    locks: manager.listLocks(),
  }));

  registerHandler(IPC_CHANNELS.LOCKS_FORCE_RELEASE, (payload) => ({
    released: manager.forceRelease(payload.path),
  }));
}
