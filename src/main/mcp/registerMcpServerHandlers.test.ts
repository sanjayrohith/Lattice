import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import Database from 'better-sqlite3';
import { ipcMain } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { runMigrations } from '../db/database';
import { migrations } from '../db/migrations';
import { McpServerRepository } from '../db/repositories/mcpServerRepository';
import { McpHttpServerManager } from './mcpHttpServerManager';
import { McpStdioServerManager } from './mcpStdioServerManager';
import { registerMcpServerHandlers } from './registerMcpServerHandlers';
import type { McpServerConfig } from './mcpServerConfig';

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

function stdioConfig(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    id: 'server-1',
    displayName: 'Echo Server',
    enabled: true,
    transport: 'stdio',
    command: 'noop',
    args: [],
    env: {},
    consentOverrides: {},
    ...overrides,
  } as McpServerConfig;
}

describe('registerMcpServerHandlers', () => {
  let db: Database.Database;
  let repository: McpServerRepository;
  let stdioManager: McpStdioServerManager;
  let httpManager: McpHttpServerManager;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db, migrations);
    repository = new McpServerRepository(db);

    stdioManager = new McpStdioServerManager({
      createTransport: () => {
        const server = new McpServer({ name: 'echo', version: '1.0.0' });
        server.registerTool('echo', { description: 'echoes' }, async () => ({ content: [] }));
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        void server.connect(serverTransport);
        return clientTransport;
      },
    });
    httpManager = new McpHttpServerManager({ createTransport: () => new Proxy({}, {}) as never });

    registerMcpServerHandlers({ repository, stdioManager, httpManager });
  });

  afterEach(async () => {
    await stdioManager.shutdownAll();
    await httpManager.shutdownAll();
  });

  it('lists no servers before anything is configured', async () => {
    const result = await invoke<{ ok: true; data: { servers: unknown[] } }>(IPC_CHANNELS.MCP_SERVER_LIST, undefined);
    expect(result.data.servers).toEqual([]);
  });

  it('upserts a server, connecting it, and lists it with running health', async () => {
    await invoke(IPC_CHANNELS.MCP_SERVER_UPSERT, { config: stdioConfig() });

    const result = await invoke<{
      ok: true;
      data: { servers: Array<{ config: McpServerConfig; health: { state: string } }> };
    }>(IPC_CHANNELS.MCP_SERVER_LIST, undefined);

    expect(result.data.servers).toHaveLength(1);
    expect(result.data.servers[0]?.health.state).toBe('running');
  });

  it('disables a server, disconnecting it', async () => {
    await invoke(IPC_CHANNELS.MCP_SERVER_UPSERT, { config: stdioConfig() });
    await invoke(IPC_CHANNELS.MCP_SERVER_SET_ENABLED, { id: 'server-1', enabled: false });

    const result = await invoke<{
      ok: true;
      data: { servers: Array<{ health: { state: string } }> };
    }>(IPC_CHANNELS.MCP_SERVER_LIST, undefined);

    expect(result.data.servers[0]?.health.state).toBe('stopped');
  });

  it('deletes a server', async () => {
    await invoke(IPC_CHANNELS.MCP_SERVER_UPSERT, { config: stdioConfig() });
    const result = await invoke<{ ok: true; data: { deleted: boolean } }>(IPC_CHANNELS.MCP_SERVER_DELETE, {
      id: 'server-1',
    });

    expect(result.data.deleted).toBe(true);
    expect(repository.findById('server-1')).toBeUndefined();
  });

  it('inspects a connected server for its discovered tools', async () => {
    await invoke(IPC_CHANNELS.MCP_SERVER_UPSERT, { config: stdioConfig() });

    const result = await invoke<{ ok: true; data: { tools: Array<{ name: string }> } }>(
      IPC_CHANNELS.MCP_SERVER_INSPECT,
      { id: 'server-1' },
    );

    expect(result.data.tools.map((t) => t.name)).toEqual(['echo']);
  });

  it('returns empty inspect results for a server that is not connected', async () => {
    repository.create({
      displayName: 'x',
      enabled: false,
      transport: 'stdio',
      command: 'noop',
      args: [],
      env: {},
      consentOverrides: {},
    });
    const created = repository.list()[0];

    const result = await invoke<{ ok: true; data: { tools: unknown[]; resources: unknown[] } }>(
      IPC_CHANNELS.MCP_SERVER_INSPECT,
      { id: created?.id },
    );

    expect(result.data).toEqual({ tools: [], resources: [] });
  });

  it('sets a per-tool consent override, persisting it on the config', async () => {
    await invoke(IPC_CHANNELS.MCP_SERVER_UPSERT, { config: stdioConfig() });

    const result = await invoke<{ ok: true; data: { config: McpServerConfig | null } }>(
      IPC_CHANNELS.MCP_SERVER_SET_TOOL_CONSENT,
      { id: 'server-1', toolName: 'mcp__server-1__echo', policy: 'always' },
    );

    expect(result.data.config?.consentOverrides).toEqual({ 'mcp__server-1__echo': 'always' });
  });
});
