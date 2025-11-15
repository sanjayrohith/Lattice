import { readFile } from 'node:fs/promises';
import { hashContent, type DriftBaseline } from './driftBaseline';
import { resolveWorkspacePath } from '../tools/pathSandbox';

/**
 * A per-file divergence result: whether the file's current content
 * still matches its baseline hash, and if not, a `score` in `[0, 1]`
 * quantifying how different it now is — `0` meaning identical, `1`
 * meaning nothing in common line-for-line. Carries both the baseline
 * and current content so a UI can render an actual diff without a
 * second round trip.
 */
export interface DivergenceSignal {
  path: string;
  diverged: boolean;
  score: number;
  baselineContent: string;
  currentContent: string;
}

/**
 * A cheap, dependency-free divergence score: the fraction of
 * corresponding lines (by index) that differ between two texts, with
 * lines beyond the shorter text's length counted as differing too
 * (an outright length change is itself a divergence, not something
 * to average away). Identical texts always score exactly `0`.
 */
export function computeDivergenceScore(baselineContent: string, currentContent: string): number {
  if (baselineContent === currentContent) return 0;

  const baselineLines = baselineContent.split('\n');
  const currentLines = currentContent.split('\n');
  const maxLines = Math.max(baselineLines.length, currentLines.length, 1);

  let differing = 0;
  for (let i = 0; i < maxLines; i++) {
    if (baselineLines[i] !== currentLines[i]) differing += 1;
  }

  return differing / maxLines;
}

/**
 * Compares every file in `baseline` against its current on-disk state
 * and emits one {@link DivergenceSignal} per file — this is the single
 * detection pass a periodic timer re-runs for the lifetime of a
 * multi-agent run, always measured against the original baseline
 * captured at the run's start (or last rebased by an accepted
 * divergence), never against the previous pass's result.
 */
export async function detectDrift(baseline: DriftBaseline, workspaceRoot: string): Promise<DivergenceSignal[]> {
  const signals: DivergenceSignal[] = [];

  for (const file of baseline.files) {
    const resolvedPath = resolveWorkspacePath(workspaceRoot, file.path);
    const currentContent = await readFile(resolvedPath, 'utf-8').catch(() => '');
    const currentHash = hashContent(currentContent);
    const diverged = currentHash !== file.contentHash;

    signals.push({
      path: file.path,
      diverged,
      score: diverged ? computeDivergenceScore(file.content, currentContent) : 0,
      baselineContent: file.content,
      currentContent,
    });
  }

  return signals;
}

/**
 * Runs {@link detectDrift} on a fixed interval for as long as the
 * returned stop function has not been called, forwarding every pass's
 * signals to `onSignals` — the mechanism a run's periodic detector is
 * actually driven by, rather than every caller reimplementing its own
 * `setInterval`.
 */
export function startDriftPolling(
  baseline: DriftBaseline,
  workspaceRoot: string,
  onSignals: (signals: DivergenceSignal[]) => void,
  intervalMs: number,
): () => void {
  const interval = setInterval(() => {
    void detectDrift(baseline, workspaceRoot).then(onSignals);
  }, intervalMs);

  return () => clearInterval(interval);
}
