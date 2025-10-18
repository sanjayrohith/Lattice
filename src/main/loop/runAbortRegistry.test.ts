import { describe, expect, it } from 'vitest';
import { RunAbortRegistry } from './runAbortRegistry';

describe('RunAbortRegistry', () => {
  it('creates a fresh, non-aborted controller for a run', () => {
    const registry = new RunAbortRegistry();
    const controller = registry.create('run-1');

    expect(controller.signal.aborted).toBe(false);
    expect(registry.get('run-1')).toBe(controller);
  });

  it('cancels a tracked run, aborting its signal', () => {
    const registry = new RunAbortRegistry();
    const controller = registry.create('run-1');

    expect(registry.cancel('run-1')).toBe(true);
    expect(controller.signal.aborted).toBe(true);
  });

  it('returns false when cancelling an untracked run', () => {
    const registry = new RunAbortRegistry();
    expect(registry.cancel('does-not-exist')).toBe(false);
  });

  it('replaces a prior controller when create is called again for the same run id', () => {
    const registry = new RunAbortRegistry();
    const first = registry.create('run-1');
    const second = registry.create('run-1');

    expect(registry.get('run-1')).toBe(second);
    expect(second).not.toBe(first);
  });

  it('stops tracking a run after dispose', () => {
    const registry = new RunAbortRegistry();
    registry.create('run-1');
    registry.dispose('run-1');

    expect(registry.get('run-1')).toBeUndefined();
    expect(registry.cancel('run-1')).toBe(false);
  });

  it('tracks multiple runs independently', () => {
    const registry = new RunAbortRegistry();
    const a = registry.create('run-a');
    const b = registry.create('run-b');

    registry.cancel('run-a');

    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(false);
  });
});
