import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { runMigrations } from '../database';
import { coreSchemaMigration } from './001_core_schema';
import { usageRecordsMigration } from './002_usage_records';
import { agentProfilesMigration } from './003_agent_profiles';
import { knowledgeGraphMigration } from './004_knowledge_graph';

function migrated(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db, [
    coreSchemaMigration,
    usageRecordsMigration,
    agentProfilesMigration,
    knowledgeGraphMigration,
  ]);
  return db;
}

describe('knowledgeGraphMigration', () => {
  it('creates kg_nodes, kg_edges, kg_chunks, and kg_embeddings with working foreign keys', () => {
    const db = migrated();

    db.prepare(
      `INSERT INTO kg_nodes (id, type, name, file_path, start_line, end_line, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('node-1', 'symbol', 'runMigrations', 'src/main/db/database.ts', 44, 60, null, '2026-01-01', '2026-01-01');

    db.prepare(
      `INSERT INTO kg_nodes (id, type, name, file_path, start_line, end_line, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('node-2', 'symbol', 'openDatabase', 'src/main/db/database.ts', 27, 35, null, '2026-01-01', '2026-01-01');

    db.prepare(
      `INSERT INTO kg_edges (id, source_node_id, target_node_id, relation, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('edge-1', 'node-1', 'node-2', 'references', '2026-01-01');

    db.prepare(
      `INSERT INTO kg_chunks (id, node_id, file_path, start_line, end_line, content, content_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('chunk-1', 'node-1', 'src/main/db/database.ts', 44, 60, 'export function runMigrations() {}', 'hash-1', '2026-01-01', '2026-01-01');

    db.prepare(
      `INSERT INTO kg_embeddings (id, chunk_id, provider, dimension, vector, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('embedding-1', 'chunk-1', 'local', 8, Buffer.alloc(32), '2026-01-01');

    const edges = db.prepare('SELECT * FROM kg_edges WHERE source_node_id = ?').all('node-1');
    expect(edges).toHaveLength(1);

    const embeddings = db.prepare('SELECT * FROM kg_embeddings WHERE chunk_id = ?').all('chunk-1');
    expect(embeddings).toHaveLength(1);

    db.prepare('DELETE FROM kg_nodes WHERE id = ?').run('node-1');
    expect(db.prepare('SELECT * FROM kg_chunks WHERE id = ?').get('chunk-1')).toBeUndefined();
    expect(db.prepare('SELECT * FROM kg_edges WHERE id = ?').get('edge-1')).toBeUndefined();

    db.close();
  });
});
