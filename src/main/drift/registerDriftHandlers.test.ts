import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ipcMain } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { captureDriftBaseline, DriftBaselineStore } from './driftBaseline';
import { registerDriftHandlers } from './registerDriftHandlers';

vi.mock('electron', () => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
  return {
    ipcMain: {
      handle: vi.fn((channel: string, handler: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, handler);
      }),
      _invoke: async (channel: string, payload: unknown) => {
        const handler = handlers.get(channel);
        if (!handler) throw new Error(`no handler for ${channel}`);
        return handler({ sender: { id: 1 } }, payload);
      },
    },
  };
});

async function invoke<T>(channel: string, payload: unknown): Promise<T> {
  return (await (ipcMain as unknown as { _invoke: (c: string, p: unknown) => Promise<T> })._invoke(
    channel,
    payload,
  )) as T;
}

describe('registerDriftHandlers', () => {
  let workspaceRoot: string;
  let baselines: DriftBaselineStore;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'lattice-drift-handlers-'));
    baselines = new DriftBaselineStore();
    registerDriftHandlers({ baselines, workspaceRoot });
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('returns an empty signal list for a run with no tracked baseline', async () => {
    const result = await invoke<{ ok: true; data: { signals: unknown[] } }>(IPC_CHANNELS.DRIFT_SIGNALS, {
      runId: 'missing',
    });
    expect(result.data.signals).toEqual([]);
  });

  it('reports a divergence signal for a changed file', async () => {
    writeFileSync(join(workspaceRoot, 'a.txt'), 'hello');
    const baseline = await captureDriftBaseline('run-1', 'spec', workspaceRoot, ['a.txt']);
    baselines.set(baseline);
    writeFileSync(join(workspaceRoot, 'a.txt'), 'changed');

    const result = await invoke<{ ok: true; data: { signals: { path: string; diverged: boolean }[] } }>(
      IPC_CHANNELS.DRIFT_SIGNALS,
      { runId: 'run-1' },
    );
    expect(result.data.signals).toEqual([
      expect.objectContaining({ path: 'a.txt', diverged: true }),
    ]);
  });

  it('accepts a divergence, rebasing the baseline to the current content', async () => {
    writeFileSync(join(workspaceRoot, 'a.txt'), 'hello');
    const baseline = await captureDriftBaseline('run-1', 'spec', workspaceRoot, ['a.txt']);
    baselines.set(baseline);
    writeFileSync(join(workspaceRoot, 'a.txt'), 'changed');

    const result = await invoke<{ ok: true; data: { accepted: boolean } }>(IPC_CHANNELS.DRIFT_ACCEPT, {
      runId: 'run-1',
      path: 'a.txt',
    });
    expect(result.data.accepted).toBe(true);
    expect(baselines.get('run-1')?.files.find((f) => f.path === 'a.txt')?.content).toBe('changed');

    const after = await invoke<{ ok: true; data: { signals: { diverged: boolean }[] } }>(
      IPC_CHANNELS.DRIFT_SIGNALS,
      { runId: 'run-1' },
    );
    expect(after.data.signals[0]?.diverged).toBe(false);
  });

  it('reverts a divergence, restoring the baseline content on disk', async () => {
    writeFileSync(join(workspaceRoot, 'a.txt'), 'hello');
    const baseline = await captureDriftBaseline('run-1', 'spec', workspaceRoot, ['a.txt']);
    baselines.set(baseline);
    writeFileSync(join(workspaceRoot, 'a.txt'), 'changed');

    const result = await invoke<{ ok: true; data: { reverted: boolean } }>(IPC_CHANNELS.DRIFT_REVERT, {
      runId: 'run-1',
      path: 'a.txt',
    });
    expect(result.data.reverted).toBe(true);
    expect(readFileSync(join(workspaceRoot, 'a.txt'), 'utf-8')).toBe('hello');
  });

  it('reports accepted: false and reverted: false for an unknown run or path', async () => {
    const accept = await invoke<{ ok: true; data: { accepted: boolean } }>(IPC_CHANNELS.DRIFT_ACCEPT, {
      runId: 'missing',
      path: 'a.txt',
    });
    expect(accept.data.accepted).toBe(false);

    const revert = await invoke<{ ok: true; data: { reverted: boolean } }>(IPC_CHANNELS.DRIFT_REVERT, {
      runId: 'missing',
      path: 'a.txt',
    });
    expect(revert.data.reverted).toBe(false);
  });
});
