import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../db/database';
import { migrations } from '../db/migrations';
import { expandChunksViaGraph } from './graphExpansion';

function insertNode(db: Database.Database, id: string, name: string): void {
  db.prepare(
    `INSERT INTO kg_nodes (id, type, name, file_path, start_line, end_line, metadata, created_at, updated_at)
     VALUES (?, 'symbol', ?, 'a.ts', 1, 1, NULL, '2026-01-01', '2026-01-01')`,
  ).run(id, name);
}

function insertChunk(db: Database.Database, id: string, nodeId: string | null): void {
  db.prepare(
    `INSERT INTO kg_chunks (id, node_id, file_path, start_line, end_line, content, content_hash, created_at, updated_at)
     VALUES (?, ?, 'a.ts', 1, 1, 'content', ?, '2026-01-01', '2026-01-01')`,
  ).run(id, nodeId, id);
}

function insertEdge(db: Database.Database, id: string, source: string, target: string, relation = 'references'): void {
  db.prepare('INSERT INTO kg_edges (id, source_node_id, target_node_id, relation, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    source,
    target,
    relation,
    '2026-01-01',
  );
}

describe('expandChunksViaGraph', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db, migrations);

    // caller -> helper -> deepDependency -> tooFar (a 3-hop chain)
    insertNode(db, 'node-caller', 'caller');
    insertNode(db, 'node-helper', 'helper');
    insertNode(db, 'node-deep', 'deepDependency');
    insertNode(db, 'node-far', 'tooFar');

    insertChunk(db, 'chunk-caller', 'node-caller');
    insertChunk(db, 'chunk-helper', 'node-helper');
    insertChunk(db, 'chunk-deep', 'node-deep');
    insertChunk(db, 'chunk-far', 'node-far');
    insertChunk(db, 'chunk-unlinked', null);

    insertEdge(db, 'edge-1', 'node-caller', 'node-helper');
    insertEdge(db, 'edge-2', 'node-helper', 'node-deep');
    insertEdge(db, 'edge-3', 'node-deep', 'node-far');
  });

  it('returns the seed first, then chunks reachable within maxHops', () => {
    const result = expandChunksViaGraph(db, ['chunk-caller'], 2);
    expect(result).toEqual(['chunk-caller', 'chunk-helper', 'chunk-deep']);
  });

  it('does not expand beyond maxHops', () => {
    const result = expandChunksViaGraph(db, ['chunk-caller'], 1);
    expect(result).toEqual(['chunk-caller', 'chunk-helper']);
  });

  it('passes through a chunk with no linked node unexpanded', () => {
    expect(expandChunksViaGraph(db, ['chunk-unlinked'], 2)).toEqual(['chunk-unlinked']);
  });

  it('deduplicates when two seeds share reachable neighbors', () => {
    const result = expandChunksViaGraph(db, ['chunk-caller', 'chunk-helper'], 2);
    expect(result).toEqual(['chunk-caller', 'chunk-helper', 'chunk-deep', 'chunk-far']);
  });

  it('returns an empty array for no seeds', () => {
    expect(expandChunksViaGraph(db, [], 2)).toEqual([]);
  });
});
