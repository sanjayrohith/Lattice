import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { openDatabase, runMigrations } from '../database';
import { coreSchemaMigration } from './001_core_schema';
import { usageRecordsMigration } from './002_usage_records';

describe('usage records migration', () => {
  let userDataPath: string;
  let db: Database.Database;

  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'lattice-usage-migration-test-'));
    db = openDatabase(userDataPath);
    runMigrations(db, [coreSchemaMigration, usageRecordsMigration]);
  });

  afterEach(() => {
    db.close();
    rmSync(userDataPath, { recursive: true, force: true });
  });

  it('creates the usage_records table alongside the core schema', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toEqual(['messages', 'sessions', 'settings', 'tool_calls', 'usage_records']);
  });

  it('advances user_version to 2', () => {
    expect(db.pragma('user_version', { simple: true })).toBe(2);
  });

  it('cascades usage_records deletion when the owning message is removed', () => {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
      's1',
      'Session',
      now,
      now,
    );
    db.prepare(
      'INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('m1', 's1', 'assistant', 'hi', now);
    db.prepare(
      `INSERT INTO usage_records
         (id, session_id, message_id, prompt_tokens, completion_tokens, total_tokens, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('u1', 's1', 'm1', 10, 5, 15, now);

    db.prepare('DELETE FROM messages WHERE id = ?').run('m1');

    expect(db.prepare('SELECT COUNT(*) AS n FROM usage_records').get()).toEqual({ n: 0 });
  });
});
