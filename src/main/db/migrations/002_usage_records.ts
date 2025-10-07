import type { Migration } from '../database';

/**
 * Per-step token usage, one row per assistant message. Kept separate from
 * `messages` so usage accounting can evolve (additional token categories,
 * provider-reported cost) without a destructive migration of message
 * content, and so a session's total is a cheap `SUM` over this table.
 */
export const usageRecordsMigration: Migration = {
  version: 2,
  name: 'usage_records',
  up: (db) => {
    db.exec(`
      CREATE TABLE usage_records (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
        message_id TEXT NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
        prompt_tokens INTEGER NOT NULL,
        completion_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX idx_usage_records_session_id ON usage_records (session_id);
    `);
  },
};
