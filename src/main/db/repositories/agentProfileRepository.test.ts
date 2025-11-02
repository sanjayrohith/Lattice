import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../database';
import { migrations } from '../migrations';
import { AgentProfileRepository } from './agentProfileRepository';

describe('AgentProfileRepository', () => {
  let db: Database.Database;
  let repository: AgentProfileRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db, migrations);
    repository = new AgentProfileRepository(db);
  });

  function sdkInput(displayName = 'Coder'): Parameters<AgentProfileRepository['create']>[0] {
    return {
      displayName,
      backend: {
        kind: 'sdk',
        modelConfig: {
          providerId: 'openai',
          modelId: 'gpt-4o',
          temperature: 0.7,
          maxTokens: 4096,
          systemPrompt: '',
        },
      },
      systemPrompt: '',
      stepBudget: 25,
      role: 'worker',
    };
  }

  it('creates and finds a profile by id', () => {
    const created = repository.create(sdkInput());
    const found = repository.findById(created.id);
    expect(found).toEqual(created);
  });

  it('lists profiles in creation order', () => {
    const a = repository.create(sdkInput('A'));
    const b = repository.create(sdkInput('B'));
    expect(repository.list().map((p) => p.id)).toEqual([a.id, b.id]);
  });

  it('updates a profile and preserves unset fields', () => {
    const created = repository.create(sdkInput());
    const updated = repository.update(created.id, { displayName: 'Renamed' });
    expect(updated?.displayName).toBe('Renamed');
    expect(updated?.backend).toEqual(created.backend);
  });

  it('returns undefined updating an unknown id', () => {
    expect(repository.update('missing', { displayName: 'x' })).toBeUndefined();
  });

  it('duplicates a profile under a new id with a default suffixed name', () => {
    const created = repository.create(sdkInput('Original'));
    const copy = repository.duplicate(created.id);
    expect(copy?.id).not.toBe(created.id);
    expect(copy?.displayName).toBe('Original (copy)');
    expect(copy?.backend).toEqual(created.backend);
  });

  it('duplicates with an explicit display name override', () => {
    const created = repository.create(sdkInput('Original'));
    const copy = repository.duplicate(created.id, 'Explicit Name');
    expect(copy?.displayName).toBe('Explicit Name');
  });

  it('returns undefined duplicating an unknown id', () => {
    expect(repository.duplicate('missing')).toBeUndefined();
  });

  it('deletes a profile', () => {
    const created = repository.create(sdkInput());
    expect(repository.delete(created.id)).toBe(true);
    expect(repository.findById(created.id)).toBeUndefined();
    expect(repository.delete(created.id)).toBe(false);
  });

  it('round-trips an acp-backed profile with a tool allowlist', () => {
    const created = repository.create({
      displayName: 'Reviewer',
      backend: { kind: 'acp', connectorId: 'gemini-cli' },
      systemPrompt: 'Review carefully.',
      toolAllowlist: ['read_file', 'grep_search'],
      stepBudget: 10,
      role: 'reviewer',
    });
    const found = repository.findById(created.id);
    expect(found).toEqual(created);
  });
});
