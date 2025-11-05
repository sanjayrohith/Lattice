import { describe, expect, it, vi } from 'vitest';
import type { OrchestrationModeRequest } from './orchestrationMode';
import { ReviewCritiqueMode, type CriticRunner, type ProducerRunner } from './reviewCritiqueMode';

const baseRequest: OrchestrationModeRequest = {
  modeId: 'review-critique',
  rootRunId: 'run-1',
  agentIds: ['developer', 'reviewer'],
  taskDescription: 'write a sort function',
};

describe('ReviewCritiqueMode.plan', () => {
  it('defaults maxRounds when not configured', () => {
    const mode = new ReviewCritiqueMode(vi.fn(), vi.fn());
    expect(mode.plan(baseRequest)).toEqual({ maxRounds: 3 });
  });

  it('uses a configured maxRounds', () => {
    const mode = new ReviewCritiqueMode(vi.fn(), vi.fn());
    expect(mode.plan({ ...baseRequest, config: { maxRounds: 1 } })).toEqual({ maxRounds: 1 });
  });
});

describe('ReviewCritiqueMode.execute', () => {
  it('stops as soon as the critic approves', async () => {
    const producer: ProducerRunner = vi.fn().mockResolvedValue('sort v1');
    const critic: CriticRunner = vi.fn().mockResolvedValue({ approved: true, critique: 'looks good' });
    const mode = new ReviewCritiqueMode(producer, critic);

    const result = await mode.execute(baseRequest, { maxRounds: 3 });

    expect(result.approved).toBe(true);
    expect(result.rounds).toHaveLength(1);
    expect(producer).toHaveBeenCalledTimes(1);
    expect(producer).toHaveBeenCalledWith({ input: 'write a sort function', feedback: undefined });
  });

  it('feeds the critic feedback into the next production round', async () => {
    const producer: ProducerRunner = vi
      .fn()
      .mockResolvedValueOnce('sort v1')
      .mockResolvedValueOnce('sort v2');
    const critic: CriticRunner = vi
      .fn()
      .mockResolvedValueOnce({ approved: false, critique: 'off by one' })
      .mockResolvedValueOnce({ approved: true, critique: 'fixed' });
    const mode = new ReviewCritiqueMode(producer, critic);

    const result = await mode.execute(baseRequest, { maxRounds: 3 });

    expect(result.approved).toBe(true);
    expect(result.rounds).toHaveLength(2);
    expect(producer).toHaveBeenNthCalledWith(2, { input: 'write a sort function', feedback: 'off by one' });
  });

  it('stops after maxRounds without approval and reports every round', async () => {
    const producer: ProducerRunner = vi.fn().mockResolvedValue('attempt');
    const critic: CriticRunner = vi.fn().mockResolvedValue({ approved: false, critique: 'still broken' });
    const mode = new ReviewCritiqueMode(producer, critic);

    const result = await mode.execute(baseRequest, { maxRounds: 2 });

    expect(result.approved).toBe(false);
    expect(result.rounds).toHaveLength(2);
    expect(producer).toHaveBeenCalledTimes(2);
  });
});

describe('ReviewCritiqueMode.summarize', () => {
  it('reports the final approved output', () => {
    const mode = new ReviewCritiqueMode(vi.fn(), vi.fn());
    const result = mode.summarize(baseRequest, {
      approved: true,
      rounds: [{ round: 1, producerOutput: 'final code', critique: 'lgtm', approved: true }],
    });
    expect(result.output).toBe('final code');
  });

  it('reports non-approval with the last critique when the round cap is reached', () => {
    const mode = new ReviewCritiqueMode(vi.fn(), vi.fn());
    const result = mode.summarize(baseRequest, {
      approved: false,
      rounds: [
        { round: 1, producerOutput: 'v1', critique: 'nope', approved: false },
        { round: 2, producerOutput: 'v2', critique: 'still nope', approved: false },
      ],
    });
    expect(result.output).toBe('not approved after 2 round(s); last critique: still nope');
  });
});
