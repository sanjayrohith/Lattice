import { describe, expect, it, vi } from 'vitest';
import { LockManager } from './lockManager';
import { LockDeadlockError, LockQueue, LockTimeoutError } from './lockQueue';

describe('LockQueue.acquire', () => {
  it('grants immediately when the path is free', async () => {
    const queue = new LockQueue(new LockManager());
    const record = await queue.acquire('/a.txt', { runId: 'r1', agentId: 'a1' });
    expect(record).toMatchObject({ runId: 'r1', agentId: 'a1' });
  });

  it('queues a second acquisition behind the current holder and grants it FIFO on release', async () => {
    const manager = new LockManager();
    const queue = new LockQueue(manager);

    await queue.acquire('/a.txt', { runId: 'r1', agentId: 'a1' });
    const secondPromise = queue.acquire('/a.txt', { runId: 'r2', agentId: 'a2' });
    const thirdPromise = queue.acquire('/a.txt', { runId: 'r3', agentId: 'a3' });

    expect(queue.waitingCount('/a.txt')).toBe(2);

    await queue.release('/a.txt', { runId: 'r1', agentId: 'a1' });
    const second = await secondPromise;
    expect(second.agentId).toBe('a2');

    await queue.release('/a.txt', { runId: 'r2', agentId: 'a2' });
    const third = await thirdPromise;
    expect(third.agentId).toBe('a3');
  });

  it('fails a queued acquisition with LockTimeoutError once its timeout elapses', async () => {
    vi.useFakeTimers();
    try {
      const queue = new LockQueue(new LockManager());
      await queue.acquire('/a.txt', { runId: 'r1', agentId: 'a1' });

      const waiting = queue.acquire('/a.txt', { runId: 'r2', agentId: 'a2' }, 1000);
      const assertion = expect(waiting).rejects.toBeInstanceOf(LockTimeoutError);

      await vi.advanceTimersByTimeAsync(1000);
      await assertion;
      expect(queue.waitingCount('/a.txt')).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets a later waiter proceed once an earlier one times out', async () => {
    vi.useFakeTimers();
    try {
      const manager = new LockManager();
      const queue = new LockQueue(manager);
      await queue.acquire('/a.txt', { runId: 'r1', agentId: 'a1' }, 100_000);

      const timesOut = queue.acquire('/a.txt', { runId: 'r2', agentId: 'a2' }, 500);
      const outlives = queue.acquire('/a.txt', { runId: 'r3', agentId: 'a3' }, 100_000);

      const timeoutAssertion = expect(timesOut).rejects.toBeInstanceOf(LockTimeoutError);
      await vi.advanceTimersByTimeAsync(500);
      await timeoutAssertion;

      await queue.release('/a.txt', { runId: 'r1', agentId: 'a1' });
      const granted = await outlives;
      expect(granted.agentId).toBe('a3');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('LockQueue deadlock detection', () => {
  it('fails the newest request immediately when it would complete a wait-for cycle', async () => {
    const queue = new LockQueue(new LockManager());

    // agent-1 holds a.txt, agent-2 holds b.txt.
    await queue.acquire('/a.txt', { runId: 'r1', agentId: 'agent-1' });
    await queue.acquire('/b.txt', { runId: 'r2', agentId: 'agent-2' });

    // agent-2 now waits on a.txt (held by agent-1): agent-2 -> agent-1.
    const agent2WaitsOnA = queue.acquire('/a.txt', { runId: 'r2', agentId: 'agent-2' });
    expect(queue.waitingCount('/a.txt')).toBe(1);

    // agent-1 now tries to wait on b.txt (held by agent-2): would create agent-1 -> agent-2 -> agent-1.
    await expect(queue.acquire('/b.txt', { runId: 'r1', agentId: 'agent-1' })).rejects.toBeInstanceOf(
      LockDeadlockError,
    );

    // The original, non-cyclic wait is unaffected.
    expect(queue.waitingCount('/a.txt')).toBe(1);

    await queue.release('/a.txt', { runId: 'r1', agentId: 'agent-1' });
    await expect(agent2WaitsOnA).resolves.toMatchObject({ agentId: 'agent-2' });
  });

  it('does not treat a fresh request for an already-free path as a deadlock', async () => {
    const queue = new LockQueue(new LockManager());
    await expect(queue.acquire('/free.txt', { runId: 'r1', agentId: 'agent-1' })).resolves.toBeDefined();
  });
});

describe('LockQueue.release', () => {
  it('returns false when releasing a path with no holder', async () => {
    const queue = new LockQueue(new LockManager());
    expect(await queue.release('/missing.txt', { runId: 'r1', agentId: 'a1' })).toBe(false);
  });
});
