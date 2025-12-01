import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { runMigrations } from '../database';
import { coreSchemaMigration } from './001_core_schema';
import { usageRecordsMigration } from './002_usage_records';
import { agentProfilesMigration } from './003_agent_profiles';
import { knowledgeGraphMigration } from './004_knowledge_graph';
import { chunkFtsMigration } from './005_chunk_fts';

describe('chunkFtsMigration', () => {
  it('keeps kg_chunks_fts synchronized with kg_chunks via triggers', () => {
    const db = new Database(':memory:');
    runMigrations(db, [
      coreSchemaMigration,
      usageRecordsMigration,
      agentProfilesMigration,
      knowledgeGraphMigration,
      chunkFtsMigration,
    ]);

    db.prepare(
      `INSERT INTO kg_chunks (id, node_id, file_path, start_line, end_line, content, content_hash, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('chunk-1', 'a.ts', 1, 1, 'export function alpha() {}', 'hash-1', '2026-01-01', '2026-01-01');

    const matched = db
      .prepare("SELECT id FROM kg_chunks_fts WHERE kg_chunks_fts MATCH 'alpha'")
      .all() as Array<{ id: string }>;
    expect(matched).toEqual([{ id: 'chunk-1' }]);

    db.prepare('DELETE FROM kg_chunks WHERE id = ?').run('chunk-1');
    const afterDelete = db
      .prepare("SELECT id FROM kg_chunks_fts WHERE kg_chunks_fts MATCH 'alpha'")
      .all();
    expect(afterDelete).toEqual([]);

    db.close();
  });
});
