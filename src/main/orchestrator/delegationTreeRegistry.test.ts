import { describe, expect, it } from 'vitest';
import { DelegationTreeRegistry } from './delegationTreeRegistry';

describe('DelegationTreeRegistry', () => {
  it('adds a root node defaulting to running status with zero tokens', () => {
    const registry = new DelegationTreeRegistry();
    const node = registry.addNode({ runId: 'r1', parentRunId: null, agentId: 'orchestrator', startedAt: 100 });
    expect(node).toEqual({
      runId: 'r1',
      parentRunId: null,
      agentId: 'orchestrator',
      status: 'running',
      startedAt: 100,
      completedAt: null,
      totalTokens: 0,
    });
  });

  it('builds a breadth-first tree from a root through nested children', () => {
    const registry = new DelegationTreeRegistry();
    registry.addNode({ runId: 'root', parentRunId: null, agentId: 'orchestrator', startedAt: 0 });
    registry.addNode({ runId: 'child-a', parentRunId: 'root', agentId: 'coder', startedAt: 1 });
    registry.addNode({ runId: 'child-b', parentRunId: 'root', agentId: 'reviewer', startedAt: 2 });
    registry.addNode({ runId: 'grandchild', parentRunId: 'child-a', agentId: 'tester', startedAt: 3 });

    const tree = registry.getTree('root').map((n) => n.runId);
    expect(tree).toEqual(['root', 'child-a', 'child-b', 'grandchild']);
  });

  it('returns an empty array for an unknown root', () => {
    const registry = new DelegationTreeRegistry();
    expect(registry.getTree('missing')).toEqual([]);
  });

  it('updates status and stamps completedAt on completion', () => {
    const registry = new DelegationTreeRegistry();
    registry.addNode({ runId: 'r1', parentRunId: null, agentId: 'a', startedAt: 0 });
    registry.setStatus('r1', 'completed', 500);
    expect(registry.getNode('r1')).toMatchObject({ status: 'completed', completedAt: 500 });
  });

  it('clears completedAt when transitioning back to running', () => {
    const registry = new DelegationTreeRegistry();
    registry.addNode({ runId: 'r1', parentRunId: null, agentId: 'a', startedAt: 0 });
    registry.setStatus('r1', 'failed', 500);
    registry.setStatus('r1', 'running');
    expect(registry.getNode('r1')?.completedAt).toBeNull();
  });

  it('accumulates token cost across multiple calls', () => {
    const registry = new DelegationTreeRegistry();
    registry.addNode({ runId: 'r1', parentRunId: null, agentId: 'a', startedAt: 0 });
    registry.addTokens('r1', 100);
    registry.addTokens('r1', 50);
    expect(registry.getNode('r1')?.totalTokens).toBe(150);
  });

  it('ignores status and token updates for an unknown run id', () => {
    const registry = new DelegationTreeRegistry();
    expect(() => registry.setStatus('missing', 'completed')).not.toThrow();
    expect(() => registry.addTokens('missing', 10)).not.toThrow();
  });

  it('releaseTree removes every node reachable from the root', () => {
    const registry = new DelegationTreeRegistry();
    registry.addNode({ runId: 'root', parentRunId: null, agentId: 'a', startedAt: 0 });
    registry.addNode({ runId: 'child', parentRunId: 'root', agentId: 'b', startedAt: 1 });

    registry.releaseTree('root');

    expect(registry.getTree('root')).toEqual([]);
    expect(registry.getNode('child')).toBeUndefined();
  });
});
