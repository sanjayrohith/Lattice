import type { Migration } from '../database';

/**
 * A standalone FTS5 index over `kg_chunks.content`, kept in sync by
 * triggers rather than SQLite's external-content mechanism — `kg_chunks`
 * carries a text primary key, not an integer one, so its rows can't be
 * addressed by `rowid` for FTS5's `content_rowid` linkage. `id` is stored
 * `UNINDEXED` purely so a match can be joined back to its chunk.
 */
export const chunkFtsMigration: Migration = {
  version: 5,
  name: 'chunk_fts',
  up: (db) => {
    db.exec(`
      CREATE VIRTUAL TABLE kg_chunks_fts USING fts5(id UNINDEXED, content);

      CREATE TRIGGER kg_chunks_fts_ai AFTER INSERT ON kg_chunks BEGIN
        INSERT INTO kg_chunks_fts (id, content) VALUES (new.id, new.content);
      END;

      CREATE TRIGGER kg_chunks_fts_ad AFTER DELETE ON kg_chunks BEGIN
        DELETE FROM kg_chunks_fts WHERE id = old.id;
      END;

      CREATE TRIGGER kg_chunks_fts_au AFTER UPDATE ON kg_chunks BEGIN
        DELETE FROM kg_chunks_fts WHERE id = old.id;
        INSERT INTO kg_chunks_fts (id, content) VALUES (new.id, new.content);
      END;
    `);
  },
};
