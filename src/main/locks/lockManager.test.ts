import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LockAlreadyHeldError, LockManager, describeLockContention, normalizeLockPath } from './lockManager';

describe('normalizeLockPath', () => {
  it('resolves a relative path to an absolute one', () => {
    expect(normalizeLockPath('./a.txt')).toBe(resolve('./a.txt'));
  });

  it('normalizes two different relative spellings of the same path identically', () => {
    expect(normalizeLockPath('a/../a.txt')).toBe(normalizeLockPath('a.txt'));
  });
});

describe('describeLockContention', () => {
  it('names the holding agent, run, and hold duration, with actionable instructions', () => {
    const message = describeLockContention('/a.txt', {
      path: '/a.txt',
      runId: 'run-1',
      agentId: 'agent-1',
      acquiredAt: Date.now() - 5000,
    });

    expect(message).toContain('agent-1');
    expect(message).toContain('run-1');
    expect(message).toContain('/a.txt');
    expect(message).toMatch(/held for \d+s/);
    expect(message).toContain('Queue this edit');
    expect(message).toContain('switch to a');
    expect(message).toContain('wait and retry');
  });
});

describe('LockManager.acquire', () => {
  it('grants a lock recording the owning run and agent', () => {
    const manager = new LockManager();
    const lock = manager.acquire('/workspace/a.txt', { runId: 'run-1', agentId: 'agent-1' });
    expect(lock).toMatchObject({ path: resolve('/workspace/a.txt'), runId: 'run-1', agentId: 'agent-1' });
  });

  it('throws LockAlreadyHeldError when a different owner tries to acquire an already-held path', () => {
    const manager = new LockManager();
    manager.acquire('/workspace/a.txt', { runId: 'run-1', agentId: 'agent-1' });

    expect(() => manager.acquire('/workspace/a.txt', { runId: 'run-2', agentId: 'agent-2' })).toThrow(
      LockAlreadyHeldError,
    );
  });

  it('names the holder and offers queue/switch/wait instructions in the error message', () => {
    const manager = new LockManager();
    manager.acquire('/workspace/a.txt', { runId: 'run-1', agentId: 'agent-1' });

    try {
      manager.acquire('/workspace/a.txt', { runId: 'run-2', agentId: 'agent-2' });
      expect.unreachable('expected acquire to throw');
    } catch (error) {
      const message = (error as LockAlreadyHeldError).message;
      expect(message).toContain('agent-1');
      expect(message).toContain('run-1');
      expect(message).toContain('Queue this edit');
      expect(message).toContain('switch to a');
      expect(message).toContain('wait and retry');
    }
  });

  it('is idempotent for the same owner re-acquiring the same path', () => {
    const manager = new LockManager();
    const first = manager.acquire('/workspace/a.txt', { runId: 'run-1', agentId: 'agent-1' });
    const second = manager.acquire('/workspace/a.txt', { runId: 'run-1', agentId: 'agent-1' });
    expect(second).toEqual(first);
  });

  it('treats two different relative paths to the same file as the same lock', () => {
    const manager = new LockManager();
    manager.acquire('a.txt', { runId: 'run-1', agentId: 'agent-1' });
    expect(() => manager.acquire('./a.txt', { runId: 'run-2', agentId: 'agent-2' })).toThrow(
      LockAlreadyHeldError,
    );
  });
});

describe('LockManager.release', () => {
  it('releases a lock held by the same owner', () => {
    const manager = new LockManager();
    manager.acquire('/workspace/a.txt', { runId: 'run-1', agentId: 'agent-1' });
    expect(manager.release('/workspace/a.txt', { runId: 'run-1', agentId: 'agent-1' })).toBe(true);
    expect(manager.isLocked('/workspace/a.txt')).toBe(false);
  });

  it('refuses to release a lock held by a different owner', () => {
    const manager = new LockManager();
    manager.acquire('/workspace/a.txt', { runId: 'run-1', agentId: 'agent-1' });
    expect(manager.release('/workspace/a.txt', { runId: 'run-2', agentId: 'agent-2' })).toBe(false);
    expect(manager.isLocked('/workspace/a.txt')).toBe(true);
  });

  it('returns false releasing a path with no lock', () => {
    const manager = new LockManager();
    expect(manager.release('/workspace/missing.txt', { runId: 'run-1', agentId: 'agent-1' })).toBe(false);
  });
});

describe('LockManager.listLocks / getLock', () => {
  it('lists every currently held lock', () => {
    const manager = new LockManager();
    manager.acquire('/a.txt', { runId: 'r1', agentId: 'a1' });
    manager.acquire('/b.txt', { runId: 'r2', agentId: 'a2' });
    expect(manager.listLocks()).toHaveLength(2);
  });

  it('getLock returns undefined for an unlocked path', () => {
    const manager = new LockManager();
    expect(manager.getLock('/a.txt')).toBeUndefined();
  });
});
