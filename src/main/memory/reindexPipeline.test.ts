import Database from 'better-sqlite3';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../db/database';
import { migrations } from '../db/migrations';
import { LocalHashingEmbeddingProvider } from './embeddingProvider';
import { ReindexPipeline } from './reindexPipeline';

describe('ReindexPipeline', () => {
  let db: Database.Database;
  let workspaceRoot: string;
  let pipeline: ReindexPipeline;

  beforeEach(async () => {
    db = new Database(':memory:');
    runMigrations(db, migrations);
    workspaceRoot = await mkdtemp(join(tmpdir(), 'lattice-reindex-'));
    pipeline = new ReindexPipeline(db, new LocalHashingEmbeddingProvider());
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  function chunkCountFor(filePath: string): number {
    return (db.prepare('SELECT COUNT(*) AS n FROM kg_chunks WHERE file_path = ?').get(filePath) as { n: number }).n;
  }

  function embeddingCount(): number {
    return (db.prepare('SELECT COUNT(*) AS n FROM kg_embeddings').get() as { n: number }).n;
  }

  it('indexes a newly added file into chunks, nodes, and embeddings', async () => {
    await writeFile(join(workspaceRoot, 'a.ts'), 'export function alpha() { return 1; }');

    const result = await pipeline.runIncrementalPass(workspaceRoot, {});

    expect(result.changes).toEqual([{ path: 'a.ts', kind: 'added' }]);
    expect(chunkCountFor('a.ts')).toBeGreaterThan(0);
    expect(embeddingCount()).toBeGreaterThan(0);
    expect(db.prepare("SELECT COUNT(*) AS n FROM kg_nodes WHERE file_path = 'a.ts'").get()).toMatchObject({ n: 2 });
  });

  it('re-chunks and re-embeds a modified file without leaving stale rows', async () => {
    await writeFile(join(workspaceRoot, 'a.ts'), 'export function alpha() {}');
    const first = await pipeline.runIncrementalPass(workspaceRoot, {});

    await writeFile(join(workspaceRoot, 'a.ts'), 'export function alpha() {}\nexport function beta() {}');
    const second = await pipeline.runIncrementalPass(workspaceRoot, first.snapshot);

    expect(second.changes).toEqual([{ path: 'a.ts', kind: 'modified' }]);
    expect(chunkCountFor('a.ts')).toBe(2);
  });

  it('leaves an unchanged file untouched on a repeat pass', async () => {
    await writeFile(join(workspaceRoot, 'a.ts'), 'export function alpha() {}');
    const first = await pipeline.runIncrementalPass(workspaceRoot, {});
    const before = chunkCountFor('a.ts');

    const second = await pipeline.runIncrementalPass(workspaceRoot, first.snapshot);

    expect(second.changes).toEqual([]);
    expect(chunkCountFor('a.ts')).toBe(before);
  });

  it('prunes chunks, nodes, and embeddings for a deleted file', async () => {
    await writeFile(join(workspaceRoot, 'a.ts'), 'export function alpha() {}');
    const first = await pipeline.runIncrementalPass(workspaceRoot, {});
    expect(chunkCountFor('a.ts')).toBeGreaterThan(0);

    await rm(join(workspaceRoot, 'a.ts'));
    const second = await pipeline.runIncrementalPass(workspaceRoot, first.snapshot);

    expect(second.changes).toEqual([{ path: 'a.ts', kind: 'deleted' }]);
    expect(chunkCountFor('a.ts')).toBe(0);
    expect(embeddingCount()).toBe(0);
    expect(db.prepare("SELECT COUNT(*) AS n FROM kg_nodes WHERE file_path = 'a.ts'").get()).toMatchObject({ n: 0 });
  });
});
