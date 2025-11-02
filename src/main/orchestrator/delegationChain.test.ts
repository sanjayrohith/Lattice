import { describe, expect, it } from 'vitest';
import {
  DelegationChainTracker,
  DelegationCycleError,
  DelegationDepthExceededError,
} from './delegationChain';

describe('DelegationChainTracker.begin', () => {
  it('registers the root agent id as the initial chain', () => {
    const tracker = new DelegationChainTracker();
    const chain = tracker.begin('run-1', 'orchestrator');
    expect(chain).toEqual(['orchestrator']);
    expect(tracker.getChain('run-1')).toEqual(['orchestrator']);
  });

  it('is idempotent for a run already begun', () => {
    const tracker = new DelegationChainTracker();
    tracker.begin('run-1', 'orchestrator');
    tracker.extend('run-1', 'coder');
    const chain = tracker.begin('run-1', 'orchestrator');
    expect(chain).toEqual(['orchestrator', 'coder']);
  });
});

describe('DelegationChainTracker.extend', () => {
  it('extends the chain with a new agent id', () => {
    const tracker = new DelegationChainTracker();
    tracker.begin('run-1', 'orchestrator');
    const chain = tracker.extend('run-1', 'coder');
    expect(chain).toEqual(['orchestrator', 'coder']);
  });

  it('rejects re-entering an agent already active in the chain', () => {
    const tracker = new DelegationChainTracker();
    tracker.begin('run-1', 'orchestrator');
    tracker.extend('run-1', 'coder');

    expect(() => tracker.extend('run-1', 'orchestrator')).toThrow(DelegationCycleError);
    expect(() => tracker.extend('run-1', 'coder')).toThrow(DelegationCycleError);
    // A rejected extend leaves the tracked chain unchanged.
    expect(tracker.getChain('run-1')).toEqual(['orchestrator', 'coder']);
  });

  it('rejects extending past the configured max depth', () => {
    const tracker = new DelegationChainTracker(2);
    tracker.begin('run-1', 'a');
    tracker.extend('run-1', 'b');

    expect(() => tracker.extend('run-1', 'c')).toThrow(DelegationDepthExceededError);
  });

  it('extends an unregistered run from an empty chain', () => {
    const tracker = new DelegationChainTracker();
    const chain = tracker.extend('run-2', 'first-agent');
    expect(chain).toEqual(['first-agent']);
  });

  it('tracks independent chains for independent run ids', () => {
    const tracker = new DelegationChainTracker();
    tracker.begin('run-1', 'a');
    tracker.begin('run-2', 'b');
    tracker.extend('run-1', 'c');

    expect(tracker.getChain('run-1')).toEqual(['a', 'c']);
    expect(tracker.getChain('run-2')).toEqual(['b']);
  });
});

describe('DelegationChainTracker.release', () => {
  it('clears the tracked chain for a run', () => {
    const tracker = new DelegationChainTracker();
    tracker.begin('run-1', 'a');
    tracker.release('run-1');
    expect(tracker.getChain('run-1')).toEqual([]);
  });
});
