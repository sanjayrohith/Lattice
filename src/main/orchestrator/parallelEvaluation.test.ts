import { describe, expect, it, vi } from 'vitest';
import type { ParallelCandidate } from './parallelMode';
import { evaluateParallelCandidates } from './parallelEvaluation';

const candidates: ParallelCandidate[] = [
  { agentId: 'a', ok: true, output: 'short' },
  { agentId: 'b', ok: true, output: 'longer and more thorough' },
  { agentId: 'c', ok: false, output: '', error: 'crashed' },
];

describe('evaluateParallelCandidates', () => {
  it('excludes failed candidates from scoring and winner selection', async () => {
    const scorer = vi.fn().mockResolvedValue(5);
    const result = await evaluateParallelCandidates(candidates, [], scorer);

    expect(scorer).toHaveBeenCalledTimes(2);
    expect(result.winner?.agentId).not.toBe('c');
    expect(result.alternates.every((c) => c.agentId !== 'c')).toBe(true);
  });

  it('selects the highest-scoring candidate as the winner', async () => {
    const scorer = (candidate: ParallelCandidate) => candidate.output.length;
    const result = await evaluateParallelCandidates(candidates, [], scorer);

    expect(result.winner?.agentId).toBe('b');
    expect(result.alternates.map((c) => c.agentId)).toEqual(['a']);
  });

  it('passes criteria through to the scorer', async () => {
    const scorer = vi.fn().mockResolvedValue(1);
    await evaluateParallelCandidates(candidates, ['correctness', 'brevity'], scorer);

    expect(scorer).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'a' }), ['correctness', 'brevity']);
  });

  it('returns an undefined winner and empty alternates when every candidate failed', async () => {
    const allFailed: ParallelCandidate[] = [{ agentId: 'a', ok: false, output: '', error: 'x' }];
    const result = await evaluateParallelCandidates(allFailed, [], vi.fn());

    expect(result.winner).toBeUndefined();
    expect(result.alternates).toEqual([]);
  });

  it('orders alternates by descending score', async () => {
    const three: ParallelCandidate[] = [
      { agentId: 'x', ok: true, output: '' },
      { agentId: 'y', ok: true, output: '' },
      { agentId: 'z', ok: true, output: '' },
    ];
    const scores: Record<string, number> = { x: 2, y: 9, z: 5 };
    const result = await evaluateParallelCandidates(three, [], (c) => scores[c.agentId] ?? 0);

    expect(result.winner?.agentId).toBe('y');
    expect(result.alternates.map((c) => c.agentId)).toEqual(['z', 'x']);
  });
});
