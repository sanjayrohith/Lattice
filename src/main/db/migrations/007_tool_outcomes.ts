import type { Migration } from '../database';

/**
 * Aggregated per-tool, per-file-type outcome counts — one row per
 * `(tool_name, file_extension)` pair, incremented in place rather than
 * appending an unbounded event log, since only the running success rate
 * is ever queried. Backs the edit-strategy routing bias based on tool
 * success rates.
 */
export const toolOutcomesMigration: Migration = {
  version: 7,
  name: 'tool_outcomes',
  up: (db) => {
    db.exec(`
      CREATE TABLE tool_outcomes (
        tool_name TEXT NOT NULL,
        file_extension TEXT NOT NULL,
        success_count INTEGER NOT NULL DEFAULT 0,
        failure_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tool_name, file_extension)
      );
    `);
  },
};
