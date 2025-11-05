import { describe, expect, it } from 'vitest';
import { LockAlreadyHeldError, LockManager } from './lockManager';
import { withFileLock } from './withFileLock';
import type { ToolExecutionContext } from '../tools/types';

describe('withFileLock', () => {
  it('runs fn directly when the context has no locks manager', async () => {
    const context: ToolExecutionContext = { workspaceRoot: '/ws' };
    const result = await withFileLock(context, '/ws/a.txt', async () => 'done');
    expect(result).toBe('done');
  });

  it('acquires and releases the lock around a successful fn', async () => {
    const locks = new LockManager();
    const context: ToolExecutionContext = { workspaceRoot: '/ws', locks, lockOwner: { runId: 'r1', agentId: 'a1' } };

    const result = await withFileLock(context, '/ws/a.txt', async () => {
      expect(locks.isLocked('/ws/a.txt')).toBe(true);
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(locks.isLocked('/ws/a.txt')).toBe(false);
  });

  it('releases the lock even when fn throws', async () => {
    const locks = new LockManager();
    const context: ToolExecutionContext = { workspaceRoot: '/ws', locks, lockOwner: { runId: 'r1', agentId: 'a1' } };

    await expect(
      withFileLock(context, '/ws/a.txt', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(locks.isLocked('/ws/a.txt')).toBe(false);
  });

  it('propagates LockAlreadyHeldError without ever calling fn', async () => {
    const locks = new LockManager();
    locks.acquire('/ws/a.txt', { runId: 'other-run', agentId: 'other-agent' });
    const context: ToolExecutionContext = { workspaceRoot: '/ws', locks, lockOwner: { runId: 'r1', agentId: 'a1' } };

    let called = false;
    await expect(
      withFileLock(context, '/ws/a.txt', async () => {
        called = true;
        return 'unused';
      }),
    ).rejects.toBeInstanceOf(LockAlreadyHeldError);
    expect(called).toBe(false);
  });
});
