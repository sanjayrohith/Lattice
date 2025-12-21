import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { runMigrations } from '../database';
import { migrations } from './index';

describe('mcpServersMigration', () => {
  it('creates the mcp_servers table with the expected columns', () => {
    const db = new Database(':memory:');
    runMigrations(db, migrations);

    db.prepare(
      `INSERT INTO mcp_servers (id, display_name, enabled, config, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      'server-1',
      'Local Filesystem',
      1,
      JSON.stringify({ transport: 'stdio', command: 'mcp-fs', args: [], env: {} }),
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    );

    const row = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get('server-1') as Record<string, unknown>;
    expect(row.display_name).toBe('Local Filesystem');
    expect(row.enabled).toBe(1);
    db.close();
  });
});
