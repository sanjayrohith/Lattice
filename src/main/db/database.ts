import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';

/**
 * A migration is a single forward-only schema change. `version` must be a
 * positive integer applied in strictly increasing order; `up` runs inside
 * the migration transaction managed by {@link runMigrations}.
 */
export interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

/** Resolves the on-disk path of the application's SQLite database file. */
export function databaseFilePath(userDataPath: string): string {
  return join(userDataPath, 'lattice.db');
}

/**
 * Opens (creating if necessary) the application's SQLite database with
 * `journal_mode=WAL` for concurrent-safe writes across process restarts
 * and `foreign_keys=ON` so referential integrity is enforced by SQLite
 * rather than by application code.
 */
export function openDatabase(userDataPath: string): Database.Database {
  const filePath = databaseFilePath(userDataPath);
  mkdirSync(dirname(filePath), { recursive: true });

  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * Applies every migration whose `version` is greater than the database's
 * current `user_version`, in ascending order, each inside its own
 * transaction. `user_version` is advanced only after a migration's `up`
 * completes without throwing, so a failed migration leaves the schema at
 * the last successfully applied version.
 */
export function runMigrations(db: Database.Database, migrations: readonly Migration[]): number {
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  let current = db.pragma('user_version', { simple: true }) as number;

  for (const migration of sorted) {
    if (migration.version <= current) continue;

    const apply = db.transaction(() => {
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
    });
    apply();
    current = migration.version;
  }

  return current;
}
