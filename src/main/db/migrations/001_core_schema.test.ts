import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { openDatabase, runMigrations } from '../database';
import { migrations } from './index';

describe('core schema migration', () => {
  let userDataPath: string;
  let db: Database.Database;

  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'lattice-migration-test-'));
    db = openDatabase(userDataPath);
    runMigrations(db, migrations);
  });

  afterEach(() => {
    db.close();
    rmSync(userDataPath, { recursive: true, force: true });
  });

  function tableNames(): string[] {
    return db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);
  }

  it('creates every core table', () => {
    expect(tableNames()).toEqual(['messages', 'sessions', 'settings', 'tool_calls']);
  });

  it('cascades message and tool_call deletion when a session is removed', () => {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
      's1',
      'Session One',
      now,
      now,
    );
    db.prepare(
      'INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('m1', 's1', 'user', 'hello', now);
    db.prepare(
      'INSERT INTO tool_calls (id, message_id, tool_name, arguments, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('t1', 'm1', 'read_file', '{}', 'succeeded', now);

    db.prepare('DELETE FROM sessions WHERE id = ?').run('s1');

    expect(db.prepare('SELECT COUNT(*) AS n FROM messages').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM tool_calls').get()).toEqual({ n: 0 });
  });

  it('persists settings as key value rows', () => {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
      'theme',
      'dark',
      now,
    );

    expect(db.prepare('SELECT value FROM settings WHERE key = ?').get('theme')).toEqual({
      value: 'dark',
    });
  });
});
