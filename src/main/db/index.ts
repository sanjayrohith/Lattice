import type Database from 'better-sqlite3';
import { openDatabase, runMigrations } from './database';
import { migrations } from './migrations';

let instance: Database.Database | undefined;

/**
 * Opens the application database and applies every pending migration on
 * first call; subsequent calls return the same connection. Call once,
 * during startup, before any repository touches the database.
 */
export function initializeDatabase(userDataPath: string): Database.Database {
  if (!instance) {
    instance = openDatabase(userDataPath);
    runMigrations(instance, migrations);
  }
  return instance;
}

/** Returns the already-initialized database connection, throwing if startup has not run yet. */
export function getDatabase(): Database.Database {
  if (!instance) {
    throw new Error('database has not been initialized; call initializeDatabase first');
  }
  return instance;
}

/** Test-only: allows suites to reset the module-level singleton between cases. */
export function resetDatabaseForTests(): void {
  instance = undefined;
}
