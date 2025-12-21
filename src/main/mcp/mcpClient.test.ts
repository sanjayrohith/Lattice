import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';
import { afterEach, describe, expect, it } from 'vitest';
import { McpClient, McpNotConnectedError, McpToolCallError } from './mcpClient';

async function startEchoServer(): Promise<{ client: McpClient; server: McpServer }> {
  const server = new McpServer({ name: 'echo-server', version: '1.0.0' });
  server.registerTool(
    'echo',
    { description: 'echoes the given text back', inputSchema: { text: z.string() } },
    async ({ text }: { text: string }) => ({ content: [{ type: 'text', text }] }),
  );

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new McpClient({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);

  return { client, server };
}

describe('McpClient', () => {
  let activeClient: McpClient | undefined;
  let activeServer: McpServer | undefined;

  afterEach(async () => {
    await activeClient?.disconnect();
    await activeServer?.close();
    activeClient = undefined;
    activeServer = undefined;
  });

  it('reports connected: false before connect', () => {
    const client = new McpClient();
    expect(client.connected).toBe(false);
  });

  it('connects and reports connected: true', async () => {
    const { client, server } = await startEchoServer();
    activeClient = client;
    activeServer = server;

    expect(client.connected).toBe(true);
  });

  it('lists tools the server declares', async () => {
    const { client, server } = await startEchoServer();
    activeClient = client;
    activeServer = server;

    const tools = await client.listTools();
    expect(tools).toEqual([
      expect.objectContaining({ name: 'echo', description: 'echoes the given text back' }),
    ]);
  });

  it('calls a tool and returns its result', async () => {
    const { client, server } = await startEchoServer();
    activeClient = client;
    activeServer = server;

    const result = (await client.callTool('echo', { text: 'hello' })) as {
      content: Array<{ type: string; text: string }>;
    };
    expect(result.content).toEqual([{ type: 'text', text: 'hello' }]);
  });

  it('throws McpNotConnectedError when used before connecting', async () => {
    const client = new McpClient();
    await expect(client.listTools()).rejects.toBeInstanceOf(McpNotConnectedError);
    await expect(client.callTool('echo', {})).rejects.toBeInstanceOf(McpNotConnectedError);
  });

  it('wraps a failed tool call in McpToolCallError', async () => {
    const { client, server } = await startEchoServer();
    activeClient = client;
    activeServer = server;

    await expect(client.callTool('does-not-exist', {})).rejects.toBeInstanceOf(McpToolCallError);
  });

  it('is a no-op to disconnect twice', async () => {
    const { client, server } = await startEchoServer();
    activeServer = server;

    await client.disconnect();
    await expect(client.disconnect()).resolves.toBeUndefined();
    expect(client.connected).toBe(false);
  });
});
