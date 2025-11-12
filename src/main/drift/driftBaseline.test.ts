import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { captureDriftBaseline, DriftBaselineStore, hashContent } from './driftBaseline';

describe('hashContent', () => {
  it('is deterministic for identical content', () => {
    expect(hashContent('hello')).toBe(hashContent('hello'));
  });

  it('differs for different content', () => {
    expect(hashContent('hello')).not.toBe(hashContent('world'));
  });
});

describe('captureDriftBaseline', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'lattice-drift-baseline-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('captures the specification and a content hash for every existing file', async () => {
    writeFileSync(join(workspaceRoot, 'a.txt'), 'hello');
    writeFileSync(join(workspaceRoot, 'b.txt'), 'world');

    const baseline = await captureDriftBaseline('run-1', 'add a greeting', workspaceRoot, ['a.txt', 'b.txt']);

    expect(baseline.runId).toBe('run-1');
    expect(baseline.specification).toBe('add a greeting');
    expect(baseline.files).toEqual([
      { path: 'a.txt', contentHash: hashContent('hello') },
      { path: 'b.txt', contentHash: hashContent('world') },
    ]);
  });

  it('records a not-yet-existing file with the empty-content hash rather than skipping it', async () => {
    const baseline = await captureDriftBaseline('run-1', 'create a file', workspaceRoot, ['new.txt']);
    expect(baseline.files).toEqual([{ path: 'new.txt', contentHash: hashContent('') }]);
  });

  it('captures nothing for an empty file list', async () => {
    const baseline = await captureDriftBaseline('run-1', 'spec', workspaceRoot, []);
    expect(baseline.files).toEqual([]);
  });
});

describe('DriftBaselineStore', () => {
  it('sets and retrieves a baseline by run id', () => {
    const store = new DriftBaselineStore();
    store.set({ runId: 'run-1', specification: 'x', capturedAt: 0, files: [] });
    expect(store.get('run-1')?.specification).toBe('x');
  });

  it('returns undefined for an unknown run id', () => {
    const store = new DriftBaselineStore();
    expect(store.get('missing')).toBeUndefined();
  });

  it('updateFileHash rebases an existing file entry', () => {
    const store = new DriftBaselineStore();
    store.set({ runId: 'run-1', specification: 'x', capturedAt: 0, files: [{ path: 'a.txt', contentHash: 'old' }] });

    store.updateFileHash('run-1', 'a.txt', 'new');
    expect(store.get('run-1')?.files).toEqual([{ path: 'a.txt', contentHash: 'new' }]);
  });

  it('updateFileHash adds a new entry for a path not yet in the baseline', () => {
    const store = new DriftBaselineStore();
    store.set({ runId: 'run-1', specification: 'x', capturedAt: 0, files: [] });

    store.updateFileHash('run-1', 'b.txt', 'hash-b');
    expect(store.get('run-1')?.files).toEqual([{ path: 'b.txt', contentHash: 'hash-b' }]);
  });

  it('updateFileHash is a no-op for an unknown run id', () => {
    const store = new DriftBaselineStore();
    expect(() => store.updateFileHash('missing', 'a.txt', 'hash')).not.toThrow();
  });

  it('release removes the stored baseline', () => {
    const store = new DriftBaselineStore();
    store.set({ runId: 'run-1', specification: 'x', capturedAt: 0, files: [] });
    store.release('run-1');
    expect(store.get('run-1')).toBeUndefined();
  });
});
