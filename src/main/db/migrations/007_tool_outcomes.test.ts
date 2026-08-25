import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { runMigrations } from '../database';
import { migrations } from './index';

describe('toolOutcomesMigration', () => {
  it('creates the tool_outcomes table keyed by tool name and file extension', () => {
    const db = new Database(':memory:');
    runMigrations(db, migrations);

    db.prepare(
      `INSERT INTO tool_outcomes (tool_name, file_extension, success_count, failure_count, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('edit_file', '.ts', 5, 1, '2026-01-01T00:00:00.000Z');

    const row = db.prepare('SELECT * FROM tool_outcomes WHERE tool_name = ? AND file_extension = ?').get(
      'edit_file',
      '.ts',
    ) as Record<string, unknown>;
    expect(row.success_count).toBe(5);
    expect(row.failure_count).toBe(1);
    db.close();
  });
});
