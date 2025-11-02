import { describe, expect, it, vi } from 'vitest';
import type { OrchestrationModeRequest } from './orchestrationMode';
import { ParallelMode, type ParallelAgentRunner } from './parallelMode';

const baseRequest: OrchestrationModeRequest = {
  modeId: 'parallel',
  rootRunId: 'run-1',
  agentIds: ['a', 'b', 'c'],
  taskDescription: 'summarize this file',
};

describe('ParallelMode.plan', () => {
  it('returns the agent ids to dispatch to', () => {
    const mode = new ParallelMode(vi.fn());
    expect(mode.plan(baseRequest)).toEqual(['a', 'b', 'c']);
  });
});

describe('ParallelMode.execute', () => {
  it('sends the identical task to every agent and aggregates successful outputs', async () => {
    const runAgent: ParallelAgentRunner = vi.fn(async ({ agentId, input }) => `${agentId} says: ${input}`);
    const mode = new ParallelMode(runAgent);

    const result = await mode.execute(baseRequest, mode.plan(baseRequest));

    expect(result.candidates).toEqual([
      { agentId: 'a', ok: true, output: 'a says: summarize this file' },
      { agentId: 'b', ok: true, output: 'b says: summarize this file' },
      { agentId: 'c', ok: true, output: 'c says: summarize this file' },
    ]);
    expect(runAgent).toHaveBeenCalledTimes(3);
  });

  it('gives every agent an independent abort signal', async () => {
    const signals: AbortSignal[] = [];
    const runAgent: ParallelAgentRunner = vi.fn(async ({ signal }) => {
      signals.push(signal);
      return 'ok';
    });
    const mode = new ParallelMode(runAgent);

    await mode.execute(baseRequest, mode.plan(baseRequest));

    expect(signals).toHaveLength(3);
    expect(new Set(signals).size).toBe(3);
  });

  it('isolates one agent failing from the others succeeding', async () => {
    const runAgent: ParallelAgentRunner = vi.fn(async ({ agentId }) => {
      if (agentId === 'b') throw new Error('b crashed');
      return `${agentId} ok`;
    });
    const mode = new ParallelMode(runAgent);

    const result = await mode.execute(baseRequest, mode.plan(baseRequest));

    expect(result.candidates).toEqual([
      { agentId: 'a', ok: true, output: 'a ok' },
      { agentId: 'b', ok: false, output: '', error: 'b crashed' },
      { agentId: 'c', ok: true, output: 'c ok' },
    ]);
  });

  it('aggregates even when every agent fails', async () => {
    const runAgent: ParallelAgentRunner = vi.fn().mockRejectedValue(new Error('all down'));
    const mode = new ParallelMode(runAgent);

    const result = await mode.execute(baseRequest, mode.plan(baseRequest));
    expect(result.candidates.every((c) => !c.ok)).toBe(true);
  });
});

describe('ParallelMode.summarize', () => {
  it('joins every successful candidate output with its agent id', () => {
    const mode = new ParallelMode(vi.fn());
    const result = mode.summarize(baseRequest, {
      candidates: [
        { agentId: 'a', ok: true, output: 'first' },
        { agentId: 'b', ok: true, output: 'second' },
      ],
    });
    expect(result.output).toBe('a: first\nb: second');
  });

  it('reports every candidate failed when none succeeded', () => {
    const mode = new ParallelMode(vi.fn());
    const result = mode.summarize(baseRequest, {
      candidates: [{ agentId: 'a', ok: false, output: '', error: 'x' }],
    });
    expect(result.output).toBe('every candidate failed');
  });
});
