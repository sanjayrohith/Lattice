import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureDriftBaseline } from './driftBaseline';
import { computeDivergenceScore, detectDrift, startDriftPolling } from './driftDetector';

describe('computeDivergenceScore', () => {
  it('returns 0 for identical content', () => {
    expect(computeDivergenceScore('a\nb\nc', 'a\nb\nc')).toBe(0);
  });

  it('returns a fractional score for a partial line change', () => {
    expect(computeDivergenceScore('a\nb\nc', 'a\nX\nc')).toBeCloseTo(1 / 3);
  });

  it('returns 1 for completely different single-line content', () => {
    expect(computeDivergenceScore('a', 'b')).toBe(1);
  });

  it('counts a length change as divergence for the extra lines', () => {
    expect(computeDivergenceScore('a', 'a\nb')).toBeCloseTo(0.5);
  });
});

describe('detectDrift', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'lattice-drift-detector-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('reports no divergence when the file is unchanged since the baseline', async () => {
    writeFileSync(join(workspaceRoot, 'a.txt'), 'hello');
    const baseline = await captureDriftBaseline('run-1', 'spec', workspaceRoot, ['a.txt']);

    const signals = await detectDrift(baseline, workspaceRoot);
    expect(signals).toEqual([
      { path: 'a.txt', diverged: false, score: 0, baselineContent: 'hello', currentContent: 'hello' },
    ]);
  });

  it('reports divergence with a nonzero score when the file changed', async () => {
    writeFileSync(join(workspaceRoot, 'a.txt'), 'hello');
    const baseline = await captureDriftBaseline('run-1', 'spec', workspaceRoot, ['a.txt']);

    writeFileSync(join(workspaceRoot, 'a.txt'), 'goodbye');
    const signals = await detectDrift(baseline, workspaceRoot);

    expect(signals[0]).toMatchObject({ path: 'a.txt', diverged: true, currentContent: 'goodbye' });
    expect(signals[0]?.score).toBeGreaterThan(0);
  });

  it('emits one signal per baseline file, independent of the others', async () => {
    writeFileSync(join(workspaceRoot, 'a.txt'), 'a');
    writeFileSync(join(workspaceRoot, 'b.txt'), 'b');
    const baseline = await captureDriftBaseline('run-1', 'spec', workspaceRoot, ['a.txt', 'b.txt']);

    writeFileSync(join(workspaceRoot, 'a.txt'), 'changed');
    const signals = await detectDrift(baseline, workspaceRoot);

    expect(signals.find((s) => s.path === 'a.txt')?.diverged).toBe(true);
    expect(signals.find((s) => s.path === 'b.txt')?.diverged).toBe(false);
  });
});

describe('startDriftPolling', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'lattice-drift-polling-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = (): void => {
        if (predicate()) {
          resolve();
          return;
        }
        if (Date.now() - start > timeoutMs) {
          reject(new Error('timed out waiting for condition'));
          return;
        }
        setTimeout(tick, 5);
      };
      tick();
    });
  }

  it('runs detectDrift on the configured interval until stopped', async () => {
    writeFileSync(join(workspaceRoot, 'a.txt'), 'hello');
    const baseline = await captureDriftBaseline('run-1', 'spec', workspaceRoot, ['a.txt']);

    const onSignals = vi.fn();
    const stop = startDriftPolling(baseline, workspaceRoot, onSignals, 20);

    await waitFor(() => onSignals.mock.calls.length >= 2);
    stop();

    const countAtStop = onSignals.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(onSignals.mock.calls.length).toBe(countAtStop);
  });
});
