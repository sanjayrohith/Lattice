import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { databaseFilePath, openDatabase, runMigrations, type Migration } from './database';
import type Database from 'better-sqlite3';

describe('openDatabase', () => {
  let userDataPath: string;
  let db: Database.Database | undefined;

  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'lattice-db-test-'));
  });

  afterEach(() => {
    db?.close();
    rmSync(userDataPath, { recursive: true, force: true });
  });

  it('creates the database file under userData', () => {
    db = openDatabase(userDataPath);
    expect(databaseFilePath(userDataPath)).toBe(join(userDataPath, 'lattice.db'));
  });

  it('enables wal journal mode', () => {
    db = openDatabase(userDataPath);
    const mode = db.pragma('journal_mode', { simple: true });
    expect(mode).toBe('wal');
  });

  it('enables foreign key enforcement', () => {
    db = openDatabase(userDataPath);
    const enabled = db.pragma('foreign_keys', { simple: true });
    expect(enabled).toBe(1);
  });
});

describe('runMigrations', () => {
  let userDataPath: string;
  let db: Database.Database;

  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'lattice-db-test-'));
    db = openDatabase(userDataPath);
  });

  afterEach(() => {
    db.close();
    rmSync(userDataPath, { recursive: true, force: true });
  });

  it('applies migrations in ascending order and records user_version', () => {
    const applied: number[] = [];
    const migrations: Migration[] = [
      { version: 2, name: 'second', up: () => applied.push(2) },
      { version: 1, name: 'first', up: () => applied.push(1) },
    ];

    const version = runMigrations(db, migrations);

    expect(applied).toEqual([1, 2]);
    expect(version).toBe(2);
    expect(db.pragma('user_version', { simple: true })).toBe(2);
  });

  it('skips migrations at or below the current version', () => {
    runMigrations(db, [{ version: 1, name: 'first', up: () => undefined }]);

    const applied: number[] = [];
    runMigrations(db, [
      { version: 1, name: 'first', up: () => applied.push(1) },
      { version: 2, name: 'second', up: () => applied.push(2) },
    ]);

    expect(applied).toEqual([2]);
  });

  it('leaves user_version unchanged when a migration throws', () => {
    expect(() =>
      runMigrations(db, [
        {
          version: 1,
          name: 'broken',
          up: () => {
            throw new Error('boom');
          },
        },
      ]),
    ).toThrow('boom');

    expect(db.pragma('user_version', { simple: true })).toBe(0);
  });
});
