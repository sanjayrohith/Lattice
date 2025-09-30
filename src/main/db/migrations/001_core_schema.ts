import type { Migration } from '../database';

/**
 * The foundational schema: conversation `sessions`, the `messages` within
 * them, the `tool_calls` a message triggered, and a flat `settings`
 * key/value table for main-process-owned configuration such as encrypted
 * credentials.
 */
export const coreSchemaMigration: Migration = {
  version: 1,
  name: 'core_schema',
  up: (db) => {
    db.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX idx_sessions_updated_at ON sessions (updated_at);

      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX idx_messages_session_id ON messages (session_id, created_at);

      CREATE TABLE tool_calls (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
        tool_name TEXT NOT NULL,
        arguments TEXT NOT NULL,
        result TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX idx_tool_calls_message_id ON tool_calls (message_id);

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  },
};
