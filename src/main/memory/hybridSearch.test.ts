import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../db/database';
import { migrations } from '../db/migrations';
import { EmbeddingRepository } from './embeddingRepository';
import { fuseRankings, hybridSearch } from './hybridSearch';

describe('fuseRankings', () => {
  it('scores items higher the earlier they rank, and sums contributions across lists', () => {
    const fused = fuseRankings([
      { ids: ['a', 'b', 'c'] },
      { ids: ['b', 'a'] },
    ]);

    expect(fused.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('applies per-list weights', () => {
    const fused = fuseRankings([
      { ids: ['a'], weight: 0.1 },
      { ids: ['b'], weight: 10 },
    ]);

    expect(fused[0]?.id).toBe('b');
  });

  it('deduplicates an id that appears in multiple lists into a single entry', () => {
    const fused = fuseRankings([{ ids: ['a', 'b'] }, { ids: ['a'] }]);
    expect(fused.filter((r) => r.id === 'a')).toHaveLength(1);
  });

  it('returns an empty list when given no lists', () => {
    expect(fuseRankings([])).toEqual([]);
  });
});

describe('hybridSearch', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db, migrations);

    const insertChunk = db.prepare(
      `INSERT INTO kg_chunks (id, node_id, file_path, start_line, end_line, content, content_hash, created_at, updated_at)
       VALUES (?, NULL, ?, 1, 1, ?, ?, '2026-01-01', '2026-01-01')`,
    );
    insertChunk.run('chunk-both', 'a.ts', 'resolveWorkspacePath handles traversal', 'hash-1');
    insertChunk.run('chunk-keyword-only', 'b.ts', 'resolveWorkspacePath appears here too', 'hash-2');
    insertChunk.run('chunk-vector-only', 'c.ts', 'totally unrelated prose', 'hash-3');

    const repo = new EmbeddingRepository(db);
    repo.upsert({ chunkId: 'chunk-both', provider: 'p', dimension: 2, vector: [1, 0] });
    repo.upsert({ chunkId: 'chunk-keyword-only', provider: 'p', dimension: 2, vector: [0, 1] });
    repo.upsert({ chunkId: 'chunk-vector-only', provider: 'p', dimension: 2, vector: [0.99, 0.01] });
  });

  it('ranks a chunk matching both signals above one matching only a single signal', () => {
    const results = hybridSearch(db, 'p', 'resolveWorkspacePath', [1, 0]);
    const ids = results.map((r) => r.id);

    expect(ids[0]).toBe('chunk-both');
    expect(ids).toContain('chunk-keyword-only');
    expect(ids).toContain('chunk-vector-only');
  });

  it('respects k', () => {
    expect(hybridSearch(db, 'p', 'resolveWorkspacePath', [1, 0], { k: 1 })).toHaveLength(1);
  });
});
