import { describe, expect, it } from 'vitest';
import { LockManager } from './lockManager';
import { RunLockCleanupCoordinator, reapOrphanedLocks, releaseLocksForRun } from './runLockCleanup';

function seeded(): LockManager {
  const manager = new LockManager();
  manager.acquire('/a.txt', { runId: 'run-1', agentId: 'agent-1' });
  manager.acquire('/b.txt', { runId: 'run-1', agentId: 'agent-2' });
  manager.acquire('/c.txt', { runId: 'run-2', agentId: 'agent-3' });
  return manager;
}

describe('releaseLocksForRun', () => {
  it('releases every lock held by the given run, across different agents', () => {
    const manager = seeded();
    const released = releaseLocksForRun(manager, 'run-1');

    expect(released).toBe(2);
    expect(manager.isLocked('/a.txt')).toBe(false);
    expect(manager.isLocked('/b.txt')).toBe(false);
    expect(manager.isLocked('/c.txt')).toBe(true);
  });

  it('releases nothing for a run holding no locks', () => {
    const manager = seeded();
    expect(releaseLocksForRun(manager, 'run-missing')).toBe(0);
    expect(manager.listLocks()).toHaveLength(3);
  });
});

describe('reapOrphanedLocks', () => {
  it('releases every lock whose run is not in the active set', () => {
    const manager = seeded();
    const reaped = reapOrphanedLocks(manager, new Set(['run-2']));

    expect(reaped).toBe(2);
    expect(manager.isLocked('/a.txt')).toBe(false);
    expect(manager.isLocked('/b.txt')).toBe(false);
    expect(manager.isLocked('/c.txt')).toBe(true);
  });

  it('releases nothing when every held lock belongs to an active run', () => {
    const manager = seeded();
    expect(reapOrphanedLocks(manager, new Set(['run-1', 'run-2']))).toBe(0);
    expect(manager.listLocks()).toHaveLength(3);
  });

  it('releases everything when the active set is empty', () => {
    const manager = seeded();
    expect(reapOrphanedLocks(manager, new Set())).toBe(3);
    expect(manager.listLocks()).toHaveLength(0);
  });
});

describe('RunLockCleanupCoordinator', () => {
  it('releases a run"s locks for every terminal lifecycle event', () => {
    for (const method of ['onRunCompleted', 'onRunFailed', 'onRunAborted', 'onRunCrashed'] as const) {
      const manager = seeded();
      const coordinator = new RunLockCleanupCoordinator(manager);
      const released = coordinator[method]('run-1');
      expect(released).toBe(2);
      expect(manager.isLocked('/c.txt')).toBe(true);
    }
  });

  it('reaps orphaned locks at startup via the coordinator', () => {
    const manager = seeded();
    const coordinator = new RunLockCleanupCoordinator(manager);
    expect(coordinator.reapOrphanedLocks(new Set(['run-1']))).toBe(1);
    expect(manager.isLocked('/c.txt')).toBe(false);
  });
});
