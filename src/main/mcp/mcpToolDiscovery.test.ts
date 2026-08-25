import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';
import { afterEach, describe, expect, it } from 'vitest';
import { McpClient } from './mcpClient';
import {
  discoverMcpTools,
  mergeMcpToolsIntoToolset,
  namespaceMcpToolName,
  resolveToolNameCollision,
  toMcpAnyTool,
} from './mcpToolDiscovery';
import type { McpServerConfig } from './mcpServerConfig';
import type { AnyTool } from '../tools/types';

function stdioConfig(id: string, enabled = true): McpServerConfig {
  return { id, displayName: id, enabled, transport: 'stdio', command: 'noop', args: [], env: {} };
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
    const result = (await tool.execute({ text: 'hi' }, { workspaceRoot: '/workspace' })) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0]?.text).toBe('hi');
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
