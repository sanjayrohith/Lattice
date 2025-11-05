import type { ParallelCandidate } from './parallelMode';

export interface ScoredCandidate extends ParallelCandidate {
  score: number;
}

export interface ParallelEvaluationResult {
  /** The highest-scoring candidate, or `undefined` if every candidate failed. */
  winner: ScoredCandidate | undefined;
  /** Every other successful candidate, highest score first, retained rather than discarded. */
  alternates: ScoredCandidate[];
}

/** Scores one successful candidate against the configured criteria; higher is better. */
export type CandidateScorer = (
  candidate: ParallelCandidate,
  criteria: readonly string[],
) => Promise<number> | number;

/**
 * Scores every successful candidate from a parallel dispatch against
 * `criteria` and auto-selects the highest-scoring one as the winner,
 * while retaining every other successful candidate as an alternate —
 * never discarding them, since a lower-scoring candidate may still be
 * useful for comparison or manual override. Failed candidates are
 * excluded entirely; a failure cannot win regardless of any score a
 * scorer might otherwise assign it.
 */
export async function evaluateParallelCandidates(
  candidates: readonly ParallelCandidate[],
  criteria: readonly string[],
  scorer: CandidateScorer,
): Promise<ParallelEvaluationResult> {
  const eligible = candidates.filter((candidate) => candidate.ok);

  const scored: ScoredCandidate[] = [];
  for (const candidate of eligible) {
    const score = await scorer(candidate, criteria);
    scored.push({ ...candidate, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const [winner, ...alternates] = scored;

  return { winner, alternates };
}
