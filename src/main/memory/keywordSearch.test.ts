import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../db/database';
import { migrations } from '../db/migrations';
import { buildFtsMatchExpression, searchChunksByKeyword } from './keywordSearch';

function insertChunk(db: Database.Database, id: string, filePath: string, content: string): void {
  db.prepare(
    `INSERT INTO kg_chunks (id, node_id, file_path, start_line, end_line, content, content_hash, created_at, updated_at)
     VALUES (?, NULL, ?, 1, 1, ?, 'hash', '2026-01-01', '2026-01-01')`,
  ).run(id, filePath, content);
}

describe('searchChunksByKeyword', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db, migrations);
  });

  it('returns bm25-ranked matches with a highlighted snippet', () => {
    insertChunk(db, 'chunk-1', 'a.ts', 'export function resolveWorkspacePath(root, path) {}');
    insertChunk(db, 'chunk-2', 'b.ts', 'export function readFile(path) {}');

    const results = searchChunksByKeyword(db, 'resolveWorkspacePath');

    expect(results).toHaveLength(1);
    expect(results[0]?.chunkId).toBe('chunk-1');
    expect(results[0]?.snippet).toContain('<mark>resolveWorkspacePath</mark>');
  });

  it('stays in sync when a chunk is updated or deleted', () => {
    insertChunk(db, 'chunk-1', 'a.ts', 'alpha content');
    expect(searchChunksByKeyword(db, 'alpha')).toHaveLength(1);

    db.prepare('UPDATE kg_chunks SET content = ? WHERE id = ?').run('beta content', 'chunk-1');
    expect(searchChunksByKeyword(db, 'alpha')).toHaveLength(0);
    expect(searchChunksByKeyword(db, 'beta')).toHaveLength(1);

    db.prepare('DELETE FROM kg_chunks WHERE id = ?').run('chunk-1');
    expect(searchChunksByKeyword(db, 'beta')).toHaveLength(0);
  });

  it('returns no results for a blank query', () => {
    insertChunk(db, 'chunk-1', 'a.ts', 'alpha content');
    expect(searchChunksByKeyword(db, '   ')).toEqual([]);
  });

  it('treats FTS5 operator characters in the query as literal text', () => {
    insertChunk(db, 'chunk-1', 'a.ts', 'handles the -1 exit code and NEAR misses');
    expect(() => searchChunksByKeyword(db, '-1 NEAR')).not.toThrow();
  });
});

describe('buildFtsMatchExpression', () => {
  it('quotes each token independently', () => {
    expect(buildFtsMatchExpression('foo bar')).toBe('"foo" "bar"');
  });

  it('escapes embedded double quotes', () => {
    expect(buildFtsMatchExpression('say "hi"')).toBe('"say" """hi"""');
  });
});
