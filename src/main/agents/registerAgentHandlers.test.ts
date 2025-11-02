import Database from 'better-sqlite3';
import { ipcMain } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { runMigrations } from '../db/database';
import { migrations } from '../db/migrations';
import { AgentProfileRepository } from '../db/repositories/agentProfileRepository';
import { registerAgentHandlers } from './registerAgentHandlers';

vi.mock('electron', () => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
  return {
    ipcMain: {
      handle: vi.fn((channel: string, handler: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, handler);
      }),
      _invoke: async (channel: string, payload: unknown) => {
        const handler = handlers.get(channel);
        if (!handler) throw new Error(`no handler for ${channel}`);
        return handler({ sender: { id: 1 } }, payload);
      },
    },
  };
});

async function invoke<T>(channel: string, payload: unknown): Promise<T> {
  return (await (ipcMain as unknown as { _invoke: (c: string, p: unknown) => Promise<T> })._invoke(
    channel,
    payload,
  )) as T;
}

describe('registerAgentHandlers', () => {
  let db: Database.Database;
  let repository: AgentProfileRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db, migrations);
    repository = new AgentProfileRepository(db);
    registerAgentHandlers(repository);
  });

  it('creates and then lists an agent', async () => {
    const created = await invoke<{ ok: true; data: { agent: { id: string; displayName: string } } }>(
      IPC_CHANNELS.AGENT_CREATE,
      { profile: { displayName: 'Coder', backend: { kind: 'acp', connectorId: 'codex-cli' } } },
    );
    expect(created.data.agent.displayName).toBe('Coder');

    const listed = await invoke<{ ok: true; data: { agents: unknown[] } }>(IPC_CHANNELS.AGENT_LIST, undefined);
    expect(listed.data.agents).toHaveLength(1);
  });

  it('updates an agent', async () => {
    const created = repository.create({
      displayName: 'Coder',
      backend: { kind: 'acp', connectorId: 'codex-cli' },
      systemPrompt: '',
      stepBudget: 25,
      role: 'worker',
    });

    const updated = await invoke<{ ok: true; data: { agent: { displayName: string } | null } }>(
      IPC_CHANNELS.AGENT_UPDATE,
      { id: created.id, patch: { displayName: 'Renamed' } },
    );
    expect(updated.data.agent?.displayName).toBe('Renamed');
  });

  it('returns a null agent updating an unknown id', async () => {
    const result = await invoke<{ ok: true; data: { agent: unknown } }>(IPC_CHANNELS.AGENT_UPDATE, {
      id: 'missing',
      patch: { displayName: 'x' },
    });
    expect(result.data.agent).toBeNull();
  });

  it('duplicates an agent', async () => {
    const created = repository.create({
      displayName: 'Coder',
      backend: { kind: 'acp', connectorId: 'codex-cli' },
      systemPrompt: '',
      stepBudget: 25,
      role: 'worker',
    });

    const duplicated = await invoke<{ ok: true; data: { agent: { id: string; displayName: string } | null } }>(
      IPC_CHANNELS.AGENT_DUPLICATE,
      { id: created.id },
    );
    expect(duplicated.data.agent?.displayName).toBe('Coder (copy)');
    expect(duplicated.data.agent?.id).not.toBe(created.id);
  });

  it('deletes an agent and errors on a second delete', async () => {
    const created = repository.create({
      displayName: 'Coder',
      backend: { kind: 'acp', connectorId: 'codex-cli' },
      systemPrompt: '',
      stepBudget: 25,
      role: 'worker',
    });

    const first = await invoke<{ ok: true; data: { deleted: boolean } }>(IPC_CHANNELS.AGENT_DELETE, {
      id: created.id,
    });
    expect(first.data.deleted).toBe(true);

    const second = await invoke<{ ok: false; error: { code: string } }>(IPC_CHANNELS.AGENT_DELETE, {
      id: created.id,
    });
    expect(second.ok).toBe(false);
    expect(second.error.code).toBe('AGENT_NOT_FOUND');
  });
});
