import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../db/database';
import { migrations } from '../db/migrations';
import { ToolOutcomeRepository } from '../db/repositories/toolOutcomeRepository';
import { selectEditStrategy } from './editStrategySelector';

describe('selectEditStrategy', () => {
  let db: Database.Database;
  let repository: ToolOutcomeRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db, migrations);
    repository = new ToolOutcomeRepository(db);
  });

  it('defaults to the first candidate when there is no history', () => {
    expect(selectEditStrategy('.ts', ['edit_file', 'rewrite_file'], repository)).toBe('edit_file');
  });

  it('defaults to the first candidate when a competitor has too few samples to trust', () => {
    repository.record('rewrite_file', '.ts', true);
    repository.record('rewrite_file', '.ts', true);

    expect(selectEditStrategy('.ts', ['edit_file', 'rewrite_file'], repository)).toBe('edit_file');
  });

  it('promotes a later candidate once it has enough samples and a strictly higher success rate', () => {
    repository.record('edit_file', '.ts', false);
    repository.record('edit_file', '.ts', false);
    repository.record('edit_file', '.ts', false);

    repository.record('rewrite_file', '.ts', true);
    repository.record('rewrite_file', '.ts', true);
    repository.record('rewrite_file', '.ts', true);

    expect(selectEditStrategy('.ts', ['edit_file', 'rewrite_file'], repository)).toBe('rewrite_file');
  });

  it('keeps the default when the default has enough samples and an equal or better rate', () => {
    repository.record('edit_file', '.ts', true);
    repository.record('edit_file', '.ts', true);
    repository.record('edit_file', '.ts', true);

    repository.record('rewrite_file', '.ts', true);
    repository.record('rewrite_file', '.ts', true);
    repository.record('rewrite_file', '.ts', true);

    expect(selectEditStrategy('.ts', ['edit_file', 'rewrite_file'], repository)).toBe('edit_file');
  });

  it('does not let history for one file extension affect another', () => {
    repository.record('rewrite_file', '.md', true);
    repository.record('rewrite_file', '.md', true);
    repository.record('rewrite_file', '.md', true);

    expect(selectEditStrategy('.ts', ['edit_file', 'rewrite_file'], repository)).toBe('edit_file');
  });

  it('throws when given no candidates', () => {
    expect(() => selectEditStrategy('.ts', [], repository)).toThrow(/at least one candidate/);
  });
});
