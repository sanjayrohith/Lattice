import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../db/database';
import { migrations } from '../db/migrations';
import { EmbeddingRepository } from './embeddingRepository';
import { LocalHashingEmbeddingProvider } from './embeddingProvider';
import { createSearchMemoryTool } from './searchMemoryTool';
import { SeenRangeTracker } from './seenRangeTracker';
import type { ToolExecutionContext } from '../tools/types';

describe('createSearchMemoryTool', () => {
  let db: Database.Database;
  const provider = new LocalHashingEmbeddingProvider();
  const context: ToolExecutionContext = { workspaceRoot: '/workspace' };

  beforeEach(async () => {
    db = new Database(':memory:');
    runMigrations(db, migrations);

    db.prepare(
      `INSERT INTO kg_chunks (id, node_id, file_path, start_line, end_line, content, content_hash, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, '2026-01-01', '2026-01-01')`,
    ).run('chunk-1', 'src/pathSandbox.ts', 1, 5, 'export function resolveWorkspacePath(root, path) {}', 'hash-1');

    const repo = new EmbeddingRepository(db);
    const [vector] = await provider.embed(['export function resolveWorkspacePath(root, path) {}']);
    repo.upsert({ chunkId: 'chunk-1', provider: provider.id, dimension: provider.dimension, vector: vector! });
  });

  it('exposes always consent and a validating input schema', () => {
    const tool = createSearchMemoryTool(db, provider);
    expect(tool.defaultConsent).toBe('always');
    expect(tool.inputSchema.parse({ query: 'x' })).toMatchObject({ query: 'x', limit: 10, expandGraph: true });
  });

  it('returns matching chunks with file path, line range, and score', async () => {
    const tool = createSearchMemoryTool(db, provider);
    const result = await tool.execute({ query: 'resolveWorkspacePath', limit: 10, expandGraph: true }, context);

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      chunkId: 'chunk-1',
      filePath: 'src/pathSandbox.ts',
      startLine: 1,
      endLine: 5,
    });
    expect(result.results[0]?.score).not.toBeNull();
  });

  it('respects a file path prefix filter', async () => {
    const tool = createSearchMemoryTool(db, provider);
    const result = await tool.execute(
      { query: 'resolveWorkspacePath', limit: 10, expandGraph: true, filePathPrefix: 'other/' },
      context,
    );
    expect(result.results.map((r) => r.filePath)).not.toContain('src/pathSandbox.ts');
  });

  it('marks returned chunks as seen when a seenRanges tracker is provided', async () => {
    const tool = createSearchMemoryTool(db, provider);
    const seenRanges = new SeenRangeTracker();

    await tool.execute({ query: 'resolveWorkspacePath', limit: 10, expandGraph: true }, { ...context, seenRanges });

    expect(seenRanges.isFullyCovered('src/pathSandbox.ts', { startLine: 1, endLine: 5 })).toBe(true);
  });

  it('returns no results for an unindexed workspace', async () => {
    const emptyDb = new Database(':memory:');
    runMigrations(emptyDb, migrations);
    const tool = createSearchMemoryTool(emptyDb, provider);

    const result = await tool.execute({ query: 'nothing here', limit: 10, expandGraph: true }, context);
    expect(result.results).toEqual([]);
  });
});
