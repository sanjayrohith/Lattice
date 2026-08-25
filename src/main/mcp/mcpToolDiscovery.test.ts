import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpClient } from './mcpClient';
import {
  discoverMcpTools,
  mergeMcpToolsIntoToolset,
  namespaceMcpToolName,
  resolveToolNameCollision,
  toMcpAnyTool,
} from './mcpToolDiscovery';
import { McpToolDiscoveryCache } from './mcpToolCache';
import type { McpServerConfig } from './mcpServerConfig';
import type { AnyTool } from '../tools/types';

function stdioConfig(id: string, enabled = true): McpServerConfig {
  return { id, displayName: id, enabled, transport: 'stdio', command: 'noop', args: [], env: {}, consentOverrides: {} };
}

async function connectedEchoClient(): Promise<{ client: McpClient; server: McpServer }> {
  const server = new McpServer({ name: 'echo', version: '1.0.0' });
  server.registerTool(
    'echo',
    { description: 'echoes text', inputSchema: { text: z.string() } },
    async ({ text }: { text: string }) => ({ content: [{ type: 'text', text }] }),
  );

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new McpClient({ name: 'test', version: '1.0.0' });
  await client.connect(clientTransport);
  return { client, server };
}

describe('discoverMcpTools', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    await Promise.all(cleanups.map((fn) => fn()));
    cleanups.length = 0;
  });

  it('collects tool descriptors from every enabled, connected server', async () => {
    const { client, server } = await connectedEchoClient();
    cleanups.push(async () => {
      await client.disconnect();
      await server.close();
    });

    const discovered = await discoverMcpTools([stdioConfig('server-1')], () => client);

    expect(discovered).toEqual([
      { serverId: 'server-1', descriptor: expect.objectContaining({ name: 'echo' }) },
    ]);
  });

  it('skips a disabled server without attempting discovery', async () => {
    const { client, server } = await connectedEchoClient();
    cleanups.push(async () => {
      await client.disconnect();
      await server.close();
    });

    const discovered = await discoverMcpTools([stdioConfig('server-1', false)], () => client);
    expect(discovered).toEqual([]);
  });

  it('skips a server with no connected client', async () => {
    const discovered = await discoverMcpTools([stdioConfig('server-1')], () => undefined);
    expect(discovered).toEqual([]);
  });

  it('merges discoveries from multiple servers', async () => {
    const a = await connectedEchoClient();
    const b = await connectedEchoClient();
    cleanups.push(
      async () => {
        await a.client.disconnect();
        await a.server.close();
      },
      async () => {
        await b.client.disconnect();
        await b.server.close();
      },
    );

    const clients: Record<string, McpClient> = { 'server-a': a.client, 'server-b': b.client };
    const discovered = await discoverMcpTools(
      [stdioConfig('server-a'), stdioConfig('server-b')],
      (id) => clients[id],
    );

    expect(discovered.map((d) => d.serverId).sort()).toEqual(['server-a', 'server-b']);
  });

  it('skips a server whose listTools call throws, logging a warning, without failing the others', async () => {
    const { client: goodClient, server: goodServer } = await connectedEchoClient();
    cleanups.push(async () => {
      await goodClient.disconnect();
      await goodServer.close();
    });

    const badClient = { connected: true, listTools: async () => Promise.reject(new Error('malformed response')) };
    const clients: Record<string, unknown> = { good: goodClient, bad: badClient };
    const logger = { warn: vi.fn() };

    const discovered = await discoverMcpTools(
      [stdioConfig('good'), stdioConfig('bad')],
      (id) => clients[id] as McpClient | undefined,
      { logger },
    );

    expect(discovered).toEqual([{ serverId: 'good', descriptor: expect.objectContaining({ name: 'echo' }) }]);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('bad'));
  });

  it('skips a server whose listTools call hangs past the timeout', async () => {
    const hungClient = { connected: true, listTools: () => new Promise(() => undefined) };
    const logger = { warn: vi.fn() };

    const discovered = await discoverMcpTools(
      [stdioConfig('hung')],
      () => hungClient as unknown as McpClient,
      { timeoutMs: 10, logger },
    );

    expect(discovered).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('timed out'));
  });

  it('serves the second call from cache without querying the server again', async () => {
    const { client, server } = await connectedEchoClient();
    cleanups.push(async () => {
      await client.disconnect();
      await server.close();
    });
    const listToolsSpy = vi.spyOn(client, 'listTools');
    const cache = new McpToolDiscoveryCache();

    await discoverMcpTools([stdioConfig('server-1')], () => client, { cache });
    await discoverMcpTools([stdioConfig('server-1')], () => client, { cache });

    expect(listToolsSpy).toHaveBeenCalledTimes(1);
  });

  it('re-queries once the server config changes, invalidating the cached entry', async () => {
    const { client, server } = await connectedEchoClient();
    cleanups.push(async () => {
      await client.disconnect();
      await server.close();
    });
    const listToolsSpy = vi.spyOn(client, 'listTools');
    const cache = new McpToolDiscoveryCache();

    await discoverMcpTools([stdioConfig('server-1')], () => client, { cache });
    await discoverMcpTools([{ ...stdioConfig('server-1'), displayName: 'renamed' }], () => client, { cache });

    expect(listToolsSpy).toHaveBeenCalledTimes(2);
  });

  it('re-queries after an explicit cache invalidation', async () => {
    const { client, server } = await connectedEchoClient();
    cleanups.push(async () => {
      await client.disconnect();
      await server.close();
    });
    const listToolsSpy = vi.spyOn(client, 'listTools');
    const cache = new McpToolDiscoveryCache();

    await discoverMcpTools([stdioConfig('server-1')], () => client, { cache });
    cache.invalidate('server-1');
    await discoverMcpTools([stdioConfig('server-1')], () => client, { cache });

    expect(listToolsSpy).toHaveBeenCalledTimes(2);
  });
});

describe('toMcpAnyTool / mergeMcpToolsIntoToolset', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    await Promise.all(cleanups.map((fn) => fn()));
    cleanups.length = 0;
  });

  it('wraps a discovered tool so calling it dispatches through the owning server client', async () => {
    const { client, server } = await connectedEchoClient();
    cleanups.push(async () => {
      await client.disconnect();
      await server.close();
    });

    const [discovered] = await discoverMcpTools([stdioConfig('server-1')], () => client);
    const tool = toMcpAnyTool(discovered!, () => client);

    expect(tool.name).toBe('mcp__server-1__echo');
    expect(tool.defaultConsent).toBe('ask');
    expect(() => tool.inputSchema.parse({})).toThrow();
    expect(tool.inputSchema.parse({ text: 'hi' })).toEqual({ text: 'hi' });

    const result = (await tool.execute({ text: 'hi' }, { workspaceRoot: '/workspace' })) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0]?.text).toBe('hi');
  });

  it('sets defaultConsent to always when the resolved name is explicitly allowlisted', async () => {
    const { client, server } = await connectedEchoClient();
    cleanups.push(async () => {
      await client.disconnect();
      await server.close();
    });

    const [discovered] = await discoverMcpTools([stdioConfig('server-1')], () => client);
    const tool = toMcpAnyTool(discovered!, () => client, {
      consentAllowlist: new Set(['mcp__server-1__echo']),
    });

    expect(tool.defaultConsent).toBe('always');
  });

  it('appends wrapped mcp tools after the base toolset', async () => {
    const { client, server } = await connectedEchoClient();
    cleanups.push(async () => {
      await client.disconnect();
      await server.close();
    });

    const discovered = await discoverMcpTools([stdioConfig('server-1')], () => client);
    const baseTool: AnyTool = {
      name: 'read_file',
      description: 'reads a file',
      inputSchema: z.object({}),
      defaultConsent: 'always',
      execute: async () => ({}),
    };

    const merged = mergeMcpToolsIntoToolset([baseTool], discovered, () => client);
    expect(merged.map((t) => t.name)).toEqual(['read_file', 'mcp__server-1__echo']);
  });

  it('never produces a name colliding with a built-in tool, even a same-named mcp tool', async () => {
    const { client, server } = await connectedEchoClient();
    cleanups.push(async () => {
      await client.disconnect();
      await server.close();
    });

    const baseTool: AnyTool = {
      name: 'read_file',
      description: 'reads a file',
      inputSchema: z.object({}),
      defaultConsent: 'always',
      execute: async () => ({}),
    };

    const discovered = [
      { serverId: 'server-1', descriptor: { name: 'read_file', description: 'a server tool named read_file', inputSchema: {} } },
    ];

    const merged = mergeMcpToolsIntoToolset([baseTool], discovered, () => client);
    expect(merged.map((t) => t.name)).toEqual(['read_file', 'mcp__server-1__read_file']);
  });

  it('logs a warning and rethrows when an invocation hangs past the call timeout', async () => {
    const hungClient = {
      callTool: () => new Promise(() => undefined),
    } as unknown as McpClient;
    const logger = { warn: vi.fn() };

    const discovered = { serverId: 'server-1', descriptor: { name: 'slow', description: '', inputSchema: {} } };
    const tool = toMcpAnyTool(discovered, () => hungClient, { callTimeoutMs: 10, logger });

    await expect(tool.execute({}, { workspaceRoot: '/workspace' })).rejects.toThrow('timed out');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('slow'));
  });
});

describe('namespaceMcpToolName', () => {
  it('prefixes the tool name with the owning server id', () => {
    expect(namespaceMcpToolName('server-1', 'echo')).toBe('mcp__server-1__echo');
  });
});

describe('resolveToolNameCollision', () => {
  it('returns the candidate unchanged when it is already unique', () => {
    expect(resolveToolNameCollision('mcp__a__echo', new Set())).toBe('mcp__a__echo');
  });

  it('appends an incrementing suffix until the name is unique', () => {
    const existing = new Set(['mcp__a__echo', 'mcp__a__echo__2']);
    expect(resolveToolNameCollision('mcp__a__echo', existing)).toBe('mcp__a__echo__3');
  });
});
