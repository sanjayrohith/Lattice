import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../db/database';
import { migrations } from '../db/migrations';
import { evictStaleChunks, runMemoryMaintenance, vacuumDatabase } from './memoryMaintenance';

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function insertChunk(db: Database.Database, id: string, nodeId: string | null, updatedAt: string): void {
  db.prepare(
    `INSERT INTO kg_chunks (id, node_id, file_path, start_line, end_line, content, content_hash, created_at, updated_at)
     VALUES (?, ?, 'a.ts', 1, 1, 'content', ?, ?, ?)`,
  ).run(id, nodeId, id, updatedAt, updatedAt);
}

function insertNode(db: Database.Database, id: string, type: string): void {
  db.prepare(
    `INSERT INTO kg_nodes (id, type, name, file_path, start_line, end_line, metadata, created_at, updated_at)
     VALUES (?, ?, 'name', 'a.ts', 1, 1, NULL, '2026-01-01', '2026-01-01')`,
  ).run(id, type);
}

describe('evictStaleChunks', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db, migrations);
  });

  it('evicts an old, unconnected chunk', () => {
    insertChunk(db, 'chunk-old', null, isoDaysAgo(200));
    const evicted = evictStaleChunks(db, { maxAgeDays: 90 });

    expect(evicted).toBe(1);
    expect(db.prepare('SELECT * FROM kg_chunks WHERE id = ?').get('chunk-old')).toBeUndefined();
  });

  it('keeps a recent chunk regardless of connectivity', () => {
    insertChunk(db, 'chunk-recent', null, isoDaysAgo(1));
    const evicted = evictStaleChunks(db, { maxAgeDays: 90 });

    expect(evicted).toBe(0);
    expect(db.prepare('SELECT * FROM kg_chunks WHERE id = ?').get('chunk-recent')).toBeDefined();
  });

  it('keeps an old chunk whose node is well connected', () => {
    insertNode(db, 'node-connected', 'symbol');
    insertNode(db, 'node-other', 'symbol');
    db.prepare('INSERT INTO kg_edges (id, source_node_id, target_node_id, relation, created_at) VALUES (?, ?, ?, ?, ?)').run(
      'edge-1',
      'node-connected',
      'node-other',
      'references',
      '2026-01-01',
    );
    insertChunk(db, 'chunk-connected', 'node-connected', isoDaysAgo(200));

    const evicted = evictStaleChunks(db, { maxAgeDays: 90 });

    expect(evicted).toBe(0);
  });

  it('never evicts a durable finding regardless of age', () => {
    insertNode(db, 'node-finding', 'finding');
    insertChunk(db, 'chunk-finding', 'node-finding', isoDaysAgo(500));

    const evicted = evictStaleChunks(db, { maxAgeDays: 90 });

    expect(evicted).toBe(0);
  });
});

describe('vacuumDatabase', () => {
  it('runs without throwing', () => {
    const db = new Database(':memory:');
    runMigrations(db, migrations);
    expect(() => vacuumDatabase(db)).not.toThrow();
  });
});

describe('runMemoryMaintenance', () => {
  it('evicts stale chunks and then vacuums', () => {
    const db = new Database(':memory:');
    runMigrations(db, migrations);
    insertChunk(db, 'chunk-old', null, isoDaysAgo(200));

    const result = runMemoryMaintenance(db, { maxAgeDays: 90 });

    expect(result.evictedChunks).toBe(1);
  });
});
