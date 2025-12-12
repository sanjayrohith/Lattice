import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../db/database';
import { migrations } from '../db/migrations';
import { EmbeddingRepository } from './embeddingRepository';
import { cosineSimilarity, searchByVector } from './vectorSearch';

function insertNode(db: Database.Database, id: string, type: string): void {
  db.prepare(
    `INSERT INTO kg_nodes (id, type, name, file_path, start_line, end_line, metadata, created_at, updated_at)
     VALUES (?, ?, 'name', 'file.ts', 1, 1, NULL, '2026-01-01', '2026-01-01')`,
  ).run(id, type);
}

function insertChunk(db: Database.Database, id: string, nodeId: string | null, filePath: string): void {
  db.prepare(
    `INSERT INTO kg_chunks (id, node_id, file_path, start_line, end_line, content, content_hash, created_at, updated_at)
     VALUES (?, ?, ?, 1, 1, 'content', 'hash', '2026-01-01', '2026-01-01')`,
  ).run(id, nodeId, filePath);
}

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors and 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1, 5);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it('returns 0 for a zero-magnitude vector instead of dividing by zero', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it('throws on mismatched vector lengths', () => {
    expect(() => cosineSimilarity([1], [1, 2])).toThrow(/differing length/);
  });
});

describe('searchByVector', () => {
  let db: Database.Database;
  let repo: EmbeddingRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db, migrations);
    repo = new EmbeddingRepository(db);

    insertNode(db, 'node-fn', 'symbol');
    insertNode(db, 'node-doc', 'doc');

    insertChunk(db, 'chunk-close', 'node-fn', 'src/a.ts');
    insertChunk(db, 'chunk-far', 'node-fn', 'src/b.ts');
    insertChunk(db, 'chunk-other-type', 'node-doc', 'src/a.ts');

    repo.upsert({ chunkId: 'chunk-close', provider: 'p', dimension: 2, vector: [1, 0] });
    repo.upsert({ chunkId: 'chunk-far', provider: 'p', dimension: 2, vector: [0, 1] });
    repo.upsert({ chunkId: 'chunk-other-type', provider: 'p', dimension: 2, vector: [0.9, 0.1] });
  });

  it('ranks candidates by similarity to the query vector, highest first', () => {
    const results = searchByVector(db, 'p', [1, 0], 10);
    expect(results.map((r) => r.chunkId)).toEqual(['chunk-close', 'chunk-other-type', 'chunk-far']);
  });

  it('respects k', () => {
    expect(searchByVector(db, 'p', [1, 0], 1)).toHaveLength(1);
  });

  it('pre-filters by file path prefix before scoring', () => {
    const results = searchByVector(db, 'p', [1, 0], 10, { filePathPrefix: 'src/a' });
    expect(results.map((r) => r.chunkId).sort()).toEqual(['chunk-close', 'chunk-other-type']);
  });

  it('pre-filters by node type before scoring', () => {
    const results = searchByVector(db, 'p', [1, 0], 10, { nodeType: 'doc' });
    expect(results.map((r) => r.chunkId)).toEqual(['chunk-other-type']);
  });

  it('only considers embeddings for the requested provider', () => {
    repo.upsert({ chunkId: 'chunk-far', provider: 'other-provider', dimension: 2, vector: [1, 0] });
    const results = searchByVector(db, 'p', [1, 0], 10, { filePathPrefix: 'src/b' });
    expect(results.map((r) => r.chunkId)).toEqual(['chunk-far']);
  });
});
