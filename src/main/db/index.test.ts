import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDatabase, initializeDatabase, resetDatabaseForTests } from './index';

describe('initializeDatabase', () => {
  let userDataPath: string;

  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'lattice-db-index-test-'));
  });

  afterEach(() => {
    try {
      getDatabase().close();
    } catch {
      // not initialized in this case; nothing to close
    }
    resetDatabaseForTests();
    rmSync(userDataPath, { recursive: true, force: true });
  });

  it('applies migrations and creates the core tables on first call', () => {
    initializeDatabase(userDataPath);

    const tables = getDatabase()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toEqual([
      'agent_profiles',
      'kg_chunks',
      'kg_chunks_fts',
      'kg_chunks_fts_config',
      'kg_chunks_fts_content',
      'kg_chunks_fts_data',
      'kg_chunks_fts_docsize',
      'kg_chunks_fts_idx',
      'kg_edges',
      'kg_embeddings',
      'kg_nodes',
      'messages',
      'sessions',
      'settings',
      'tool_calls',
      'usage_records',
    ]);
  });

  it('returns the same connection on subsequent calls', () => {
    const first = initializeDatabase(userDataPath);
    const second = initializeDatabase(userDataPath);

    expect(second).toBe(first);
  });

  it('throws from getDatabase before initialization', () => {
    resetDatabaseForTests();
    expect(() => getDatabase()).toThrow('database has not been initialized');
  });
});
