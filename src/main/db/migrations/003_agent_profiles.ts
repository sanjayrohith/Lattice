import type { Migration } from '../database';

/**
 * Persisted agent profiles: identity, the backend that drives their
 * turns (an SDK model config or an ACP connector reference), and their
 * orchestration settings. `backend` and `tool_allowlist` are stored as
 * JSON text — both are variant/nullable shapes validated by
 * `agentProfileSchema` at the repository boundary rather than modeled
 * as relational columns.
 */
export const agentProfilesMigration: Migration = {
  version: 3,
  name: 'agent_profiles',
  up: (db) => {
    db.exec(`
      CREATE TABLE agent_profiles (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        backend TEXT NOT NULL,
        system_prompt TEXT NOT NULL DEFAULT '',
        tool_allowlist TEXT,
        step_budget INTEGER NOT NULL DEFAULT 25,
        role TEXT NOT NULL DEFAULT 'worker',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  },
};
