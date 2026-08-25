import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../database';
import { migrations } from '../migrations';
import { McpServerRepository } from './mcpServerRepository';

describe('McpServerRepository', () => {
  let db: Database.Database;
  let repository: McpServerRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db, migrations);
    repository = new McpServerRepository(db);
  });

  function stdioInput(displayName = 'Local Filesystem'): Parameters<McpServerRepository['create']>[0] {
    return {
      displayName,
      enabled: true,
      transport: 'stdio',
      command: 'mcp-fs',
      args: ['--root', '.'],
      env: {},
      consentOverrides: {},
    };
  }

  function httpInput(displayName = 'Remote Search'): Parameters<McpServerRepository['create']>[0] {
    return {
      displayName,
      enabled: true,
      transport: 'http',
      url: 'https://mcp.example.test/rpc',
      headers: { authorization: 'Bearer token' },
      consentOverrides: {},
    };
  }

  it('creates and finds a stdio server config by id', () => {
    const created = repository.create(stdioInput());
    const found = repository.findById(created.id);
    expect(found).toEqual(created);
    expect(found?.transport).toBe('stdio');
  });

  it('creates and finds an http server config by id', () => {
    const created = repository.create(httpInput());
    const found = repository.findById(created.id);
    expect(found).toEqual(created);
    expect(found?.transport).toBe('http');
  });

  it('returns undefined for a missing id', () => {
    expect(repository.findById('missing')).toBeUndefined();
  });

  it('lists every configured server in creation order', () => {
    repository.create(stdioInput('first'));
    repository.create(httpInput('second'));
    expect(repository.list().map((s) => s.displayName)).toEqual(['first', 'second']);
  });

  it('updates a config, preserving its transport-specific fields when unspecified', () => {
    const created = repository.create(stdioInput());
    const updated = repository.update(created.id, { displayName: 'renamed', enabled: false });

    expect(updated?.displayName).toBe('renamed');
    expect(updated?.enabled).toBe(false);
    expect(updated).toMatchObject({ transport: 'stdio', command: 'mcp-fs' });
  });

  it('returns undefined when updating a missing id', () => {
    expect(repository.update('missing', { displayName: 'x' })).toBeUndefined();
  });

  it('deletes a config and reports success', () => {
    const created = repository.create(stdioInput());
    expect(repository.delete(created.id)).toBe(true);
    expect(repository.findById(created.id)).toBeUndefined();
  });

  it('reports false deleting a missing id', () => {
    expect(repository.delete('missing')).toBe(false);
  });

  it('upsert creates a new row at the caller-supplied id', () => {
    const config = repository.upsert({ id: 'server-1', ...stdioInput('New Server') } as never);
    expect(config.id).toBe('server-1');
    expect(repository.findById('server-1')).toEqual(config);
  });

  it('upsert replaces an existing row at the same id', () => {
    const first = repository.upsert({ id: 'server-1', ...stdioInput('First') } as never);
    const second = repository.upsert({ id: 'server-1', ...stdioInput('Second') } as never);

    expect(second.id).toBe(first.id);
    expect(repository.list()).toHaveLength(1);
    expect(repository.findById('server-1')?.displayName).toBe('Second');
  });
});
