import type { Migration } from '../database';

/**
 * Persisted MCP server configurations. `config` stores the full,
 * transport-tagged JSON body (validated by `mcpServerConfigSchema` at the
 * repository boundary — see `agent_profiles`' `backend` column for the
 * same pattern) so stdio's `command`/`args`/`env` and http's
 * `url`/`headers` share one table without a sparse column for each
 * transport's fields. `display_name` and `enabled` are duplicated as
 * real columns purely so the server manager panel can list and toggle
 * without deserializing every row's JSON.
 */
export const mcpServersMigration: Migration = {
  version: 6,
  name: 'mcp_servers',
  up: (db) => {
    db.exec(`
      CREATE TABLE mcp_servers (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        config TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX idx_mcp_servers_enabled ON mcp_servers (enabled);
    `);
  },
};
