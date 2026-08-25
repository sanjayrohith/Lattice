import type { ToolOutcomeRepository } from '../db/repositories/toolOutcomeRepository';

/** Minimum recorded attempts before a candidate's success rate is trusted over the default ordering. */
const MIN_SAMPLE_SIZE = 3;

function successRate(successCount: number, failureCount: number): number {
  const total = successCount + failureCount;
  return total === 0 ? 0 : successCount / total;
}

/**
 * Picks the edit-strategy tool to prefer for `fileExtension` among
 * `candidates`, in the order a caller lists them (e.g.
 * `['edit_file', 'rewrite_file']` — try the surgical search-and-replace
 * before falling back to a full rewrite). A candidate is only promoted
 * ahead of an earlier-listed one once it has at least
 * {@link MIN_SAMPLE_SIZE} recorded attempts and a strictly higher
 * success rate for that file type — a single failure or a handful of
 * samples should never override the sensible default ordering.
 */
export function selectEditStrategy(
  fileExtension: string,
  candidates: readonly string[],
  repository: ToolOutcomeRepository,
): string {
  if (candidates.length === 0) {
    throw new Error('selectEditStrategy requires at least one candidate');
  }

  const defaultChoice = candidates[0]!;
  const defaultStats = repository.get(defaultChoice, fileExtension);
  const defaultRate = defaultStats ? successRate(defaultStats.successCount, defaultStats.failureCount) : 0;
  const defaultSamples = defaultStats ? defaultStats.successCount + defaultStats.failureCount : 0;

  let best = defaultChoice;
  let bestRate = defaultSamples >= MIN_SAMPLE_SIZE ? defaultRate : -1;

  for (const candidate of candidates.slice(1)) {
    const stats = repository.get(candidate, fileExtension);
    if (!stats) continue;

    const samples = stats.successCount + stats.failureCount;
    if (samples < MIN_SAMPLE_SIZE) continue;

    const rate = successRate(stats.successCount, stats.failureCount);
    if (rate > bestRate) {
      best = candidate;
      bestRate = rate;
    }
  }

  return best;
}
