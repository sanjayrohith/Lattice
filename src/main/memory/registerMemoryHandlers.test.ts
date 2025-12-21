import Database from 'better-sqlite3';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ipcMain } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { runMigrations } from '../db/database';
import { migrations } from '../db/migrations';
import { LocalHashingEmbeddingProvider } from './embeddingProvider';
import { registerMemoryHandlers } from './registerMemoryHandlers';

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

describe('registerMemoryHandlers', () => {
  let db: Database.Database;
  let workspaceRoot: string;

  beforeEach(async () => {
    db = new Database(':memory:');
    runMigrations(db, migrations);
    workspaceRoot = await mkdtemp(join(tmpdir(), 'lattice-memory-handlers-'));
    registerMemoryHandlers({ db, embeddingProvider: new LocalHashingEmbeddingProvider(), workspaceRoot });
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('reindexes the workspace and then finds a chunk via search', async () => {
    await writeFile(join(workspaceRoot, 'a.ts'), 'export function resolveWorkspacePath() {}');

    const reindexResult = await invoke<{ ok: true; data: { reindexed: boolean; changedFiles: number } }>(
      IPC_CHANNELS.MEMORY_REINDEX,
      undefined,
    );
    expect(reindexResult.data).toEqual({ reindexed: true, changedFiles: 1 });

    const searchResult = await invoke<{ ok: true; data: { results: Array<{ filePath: string }> } }>(
      IPC_CHANNELS.MEMORY_SEARCH,
      { query: 'resolveWorkspacePath' },
    );
    expect(searchResult.data.results.map((r) => r.filePath)).toContain('a.ts');
  });

  it('returns no results before anything has been indexed', async () => {
    const result = await invoke<{ ok: true; data: { results: unknown[] } }>(IPC_CHANNELS.MEMORY_SEARCH, {
      query: 'nothing indexed yet',
    });
    expect(result.data.results).toEqual([]);
  });

  it('rejects an invalid search payload before the handler runs', async () => {
    const result = await invoke<{ ok: false; error: { code: string } }>(IPC_CHANNELS.MEMORY_SEARCH, { query: '' });
    expect(result.error.code).toBe('INVALID_PAYLOAD');
  });
});
