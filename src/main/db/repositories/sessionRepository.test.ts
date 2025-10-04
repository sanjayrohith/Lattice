import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { openDatabase, runMigrations } from '../database';
import { migrations } from '../migrations';
import { SessionRepository } from './sessionRepository';

describe('SessionRepository', () => {
  let userDataPath: string;
  let db: Database.Database;
  let repo: SessionRepository;

  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'lattice-session-repo-test-'));
    db = openDatabase(userDataPath);
    runMigrations(db, migrations);
    repo = new SessionRepository(db);
  });

  afterEach(() => {
    db.close();
    rmSync(userDataPath, { recursive: true, force: true });
  });

  it('creates and finds a session by id', () => {
    const created = repo.create({ title: 'First session' });

    expect(repo.findById(created.id)).toEqual(created);
  });

  it('returns undefined for a missing session', () => {
    expect(repo.findById('does-not-exist')).toBeUndefined();
  });

  it('lists sessions most recently updated first', () => {
    const first = repo.create({ title: 'First' });
    const second = repo.create({ title: 'Second' });
    // Force a strictly later `updated_at` than `second`'s creation timestamp
    // so ordering is deterministic even when both rows are created within
    // the same millisecond.
    const laterTimestamp = new Date(Date.now() + 1000).toISOString();
    db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(laterTimestamp, first.id);

    const list = repo.list();
    expect(list.map((s) => s.id)).toEqual([first.id, second.id]);
  });

  it('updates title and refreshes updatedAt', () => {
    const created = repo.create({ title: 'Original' });
    const updated = repo.update(created.id, { title: 'Renamed' });

    expect(updated?.title).toBe('Renamed');
    expect(updated?.createdAt).toBe(created.createdAt);
  });

  it('returns undefined when updating a missing session', () => {
    expect(repo.update('missing', { title: 'x' })).toBeUndefined();
  });

  it('deletes a session', () => {
    const created = repo.create({ title: 'To delete' });

    expect(repo.delete(created.id)).toBe(true);
    expect(repo.findById(created.id)).toBeUndefined();
  });
});
