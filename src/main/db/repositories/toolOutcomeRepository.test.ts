import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../database';
import { migrations } from '../migrations';
import { ToolOutcomeRepository } from './toolOutcomeRepository';

describe('ToolOutcomeRepository', () => {
  let db: Database.Database;
  let repository: ToolOutcomeRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db, migrations);
    repository = new ToolOutcomeRepository(db);
  });

  it('returns undefined for a tool/extension pair with no recorded outcomes', () => {
    expect(repository.get('edit_file', '.ts')).toBeUndefined();
  });

  it('creates a row on the first recorded outcome', () => {
    repository.record('edit_file', '.ts', true);
    expect(repository.get('edit_file', '.ts')).toMatchObject({ successCount: 1, failureCount: 0 });
  });

  it('accumulates successes and failures across repeated calls', () => {
    repository.record('edit_file', '.ts', true);
    repository.record('edit_file', '.ts', true);
    repository.record('edit_file', '.ts', false);

    expect(repository.get('edit_file', '.ts')).toMatchObject({ successCount: 2, failureCount: 1 });
  });

  it('keeps separate counters per tool and per file extension', () => {
    repository.record('edit_file', '.ts', true);
    repository.record('rewrite_file', '.ts', false);
    repository.record('edit_file', '.md', false);

    expect(repository.get('edit_file', '.ts')).toMatchObject({ successCount: 1, failureCount: 0 });
    expect(repository.get('rewrite_file', '.ts')).toMatchObject({ successCount: 0, failureCount: 1 });
    expect(repository.get('edit_file', '.md')).toMatchObject({ successCount: 0, failureCount: 1 });
  });

  it('lists every tool recorded for a given file extension', () => {
    repository.record('edit_file', '.ts', true);
    repository.record('rewrite_file', '.ts', true);
    repository.record('edit_file', '.md', true);

    expect(repository.listByFileExtension('.ts').map((s) => s.toolName).sort()).toEqual(['edit_file', 'rewrite_file']);
  });
});
