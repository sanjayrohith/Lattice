import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../db/database';
import { migrations } from '../db/migrations';
import { deserializeVector, EmbeddingRepository, serializeVector } from './embeddingRepository';

function insertChunk(db: Database.Database, id: string): void {
  db.prepare(
    `INSERT INTO kg_chunks (id, node_id, file_path, start_line, end_line, content, content_hash, created_at, updated_at)
     VALUES (?, NULL, 'a.ts', 1, 1, 'content', 'hash', '2026-01-01', '2026-01-01')`,
  ).run(id);
}

describe('serializeVector / deserializeVector', () => {
  it('round trips floating point vectors', () => {
    const vector = [0.5, -0.25, 1, 0, -1.5];
    const blob = serializeVector(vector);
    const restored = deserializeVector(blob);
    restored.forEach((value, index) => expect(value).toBeCloseTo(vector[index]!, 5));
  });
});

describe('EmbeddingRepository', () => {
  let db: Database.Database;
  let repo: EmbeddingRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db, migrations);
    repo = new EmbeddingRepository(db);
    insertChunk(db, 'chunk-1');
  });

  it('stores and retrieves a vector for a chunk and provider', () => {
    repo.upsert({ chunkId: 'chunk-1', provider: 'local-hashing', dimension: 3, vector: [1, 2, 3] });

    const found = repo.findByChunkAndProvider('chunk-1', 'local-hashing');
    expect(found?.dimension).toBe(3);
    expect(found?.vector).toEqual([1, 2, 3]);
  });

  it('replaces the existing vector on a repeat upsert for the same chunk and provider', () => {
    const first = repo.upsert({ chunkId: 'chunk-1', provider: 'local-hashing', dimension: 2, vector: [1, 0] });
    const second = repo.upsert({ chunkId: 'chunk-1', provider: 'local-hashing', dimension: 2, vector: [0, 1] });

    expect(second.id).toBe(first.id);
    expect(repo.listByProvider('local-hashing')).toHaveLength(1);
    expect(repo.findByChunkAndProvider('chunk-1', 'local-hashing')?.vector).toEqual([0, 1]);
  });

  it('keeps separate rows for the same chunk under different providers', () => {
    repo.upsert({ chunkId: 'chunk-1', provider: 'local-hashing', dimension: 2, vector: [1, 0] });
    repo.upsert({ chunkId: 'chunk-1', provider: 'remote-openai', dimension: 2, vector: [0, 1] });

    expect(repo.findByChunkAndProvider('chunk-1', 'local-hashing')?.vector).toEqual([1, 0]);
    expect(repo.findByChunkAndProvider('chunk-1', 'remote-openai')?.vector).toEqual([0, 1]);
  });
});
