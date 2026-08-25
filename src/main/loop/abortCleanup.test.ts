import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AbortCleanupCoordinator, PendingDecisionRegistry } from './abortCleanup';
import { writeFileTool } from '../tools/writeFile';
import { runCommandTool } from '../tools/runCommand';

describe('AbortCleanupCoordinator', () => {
  it('runs a registered action when the signal aborts', () => {
    const controller = new AbortController();
    const coordinator = new AbortCleanupCoordinator(controller.signal);
    const action = vi.fn();

    coordinator.onAbort(action);
    controller.abort();

    expect(action).toHaveBeenCalledTimes(1);
  });

  it('runs every registered action, in registration order', () => {
    const controller = new AbortController();
    const coordinator = new AbortCleanupCoordinator(controller.signal);
    const order: number[] = [];

    coordinator.onAbort(() => order.push(1));
    coordinator.onAbort(() => order.push(2));
    coordinator.onAbort(() => order.push(3));
    controller.abort();

    expect(order).toEqual([1, 2, 3]);
  });

  it('runs cleanup at most once even if abort fires more than once', () => {
    const controller = new AbortController();
    const coordinator = new AbortCleanupCoordinator(controller.signal);
    const action = vi.fn();

    coordinator.onAbort(action);
    controller.abort();
    controller.abort();

    expect(action).toHaveBeenCalledTimes(1);
  });

  it('runs an action immediately if registered after the signal already aborted', () => {
    const controller = new AbortController();
    controller.abort();
    const coordinator = new AbortCleanupCoordinator(controller.signal);
    const action = vi.fn();

    coordinator.onAbort(action);

    expect(action).toHaveBeenCalledTimes(1);
    expect(coordinator.isTriggered).toBe(true);
  });

  it('does not run an action that was unregistered before abort', () => {
    const controller = new AbortController();
    const coordinator = new AbortCleanupCoordinator(controller.signal);
    const action = vi.fn();

    const unregister = coordinator.onAbort(action);
    unregister();
    controller.abort();

    expect(action).not.toHaveBeenCalled();
  });

  it('runs remaining actions even if an earlier one throws', () => {
    const controller = new AbortController();
    const coordinator = new AbortCleanupCoordinator(controller.signal);
    const second = vi.fn();

    coordinator.onAbort(() => {
      throw new Error('boom');
    });
    coordinator.onAbort(second);
    controller.abort();

    expect(second).toHaveBeenCalledTimes(1);
  });

  it('kills a spawned child process on abort', async () => {
    const controller = new AbortController();
    const coordinator = new AbortCleanupCoordinator(controller.signal);
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lattice-abort-cleanup-test-'));

    try {
      const resultPromise = runCommandTool.execute(
        runCommandTool.inputSchema.parse({
          command: process.execPath,
          args: ['-e', 'setTimeout(() => {}, 5000)'],
          timeoutMs: 60_000,
        }),
        { workspaceRoot, signal: controller.signal },
      );

      coordinator.onAbort(() => controller.abort());
      // run_command already receives the same signal directly; aborting
      // here exercises the coordinator alongside that existing wiring.
      controller.abort();

      await expect(resultPromise).rejects.toBeTruthy();
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('preserves a file write that already completed before abort', async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lattice-abort-preserve-test-'));
    const controller = new AbortController();
    const coordinator = new AbortCleanupCoordinator(controller.signal);

    try {
      await writeFileTool.execute(
        writeFileTool.inputSchema.parse({ path: 'done.txt', content: 'already written' }),
        { workspaceRoot, signal: controller.signal },
      );

      coordinator.onAbort(() => {
        /* nothing to clean up: the write already resolved */
      });
      controller.abort();

      expect(readFileSync(join(workspaceRoot, 'done.txt'), 'utf-8')).toBe('already written');
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});

describe('PendingDecisionRegistry', () => {
  it('resolves a registered decision by id', () => {
    const registry = new PendingDecisionRegistry<'accepted' | 'declined'>();
    const resolve = vi.fn();

    registry.register('c1', resolve);
    expect(registry.resolve('c1', 'accepted')).toBe(true);

    expect(resolve).toHaveBeenCalledWith('accepted');
    expect(registry.pendingCount).toBe(0);
  });

  it('returns false when resolving an id that was never registered', () => {
    const registry = new PendingDecisionRegistry<'accepted' | 'declined'>();
    expect(registry.resolve('missing', 'declined')).toBe(false);
  });

  it('resolveAll declines every pending consent request', () => {
    const registry = new PendingDecisionRegistry<'accepted' | 'declined'>();
    const first = vi.fn();
    const second = vi.fn();

    registry.register('c1', first);
    registry.register('c2', second);
    registry.resolveAll('declined');

    expect(first).toHaveBeenCalledWith('declined');
    expect(second).toHaveBeenCalledWith('declined');
    expect(registry.pendingCount).toBe(0);
  });

  it('unregister removes a pending decision without resolving it', () => {
    const registry = new PendingDecisionRegistry<'accepted' | 'declined'>();
    const resolve = vi.fn();

    const unregister = registry.register('c1', resolve);
    unregister();
    registry.resolveAll('declined');

    expect(resolve).not.toHaveBeenCalled();
  });

  it('integrates with AbortCleanupCoordinator to decline pending consent on abort', () => {
    const controller = new AbortController();
    const coordinator = new AbortCleanupCoordinator(controller.signal);
    const registry = new PendingDecisionRegistry<'accepted' | 'declined'>();
    const resolve = vi.fn();

    registry.register('c1', resolve);
    coordinator.onAbort(() => registry.resolveAll('declined'));
    controller.abort();

    expect(resolve).toHaveBeenCalledWith('declined');
  });
});
