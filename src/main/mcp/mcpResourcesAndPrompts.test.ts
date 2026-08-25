import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';
import { afterEach, describe, expect, it } from 'vitest';
import { McpClient } from './mcpClient';
import { resourceToMessagePart, resourcesToMessageParts } from './mcpResourceAttachment';

async function startServer(): Promise<{ client: McpClient; server: McpServer }> {
  const server = new McpServer({ name: 'ctx-server', version: '1.0.0' });

  server.registerResource(
    'readme',
    'file:///README.md',
    { description: 'project readme', mimeType: 'text/plain' },
    async (uri) => ({ contents: [{ uri: uri.toString(), text: '# Lattice', mimeType: 'text/plain' }] }),
  );

  server.registerResource(
    'logo',
    'file:///logo.png',
    { description: 'project logo', mimeType: 'image/png' },
    async (uri) => ({ contents: [{ uri: uri.toString(), blob: 'iVBORw0KGgo=', mimeType: 'image/png' }] }),
  );

  server.registerPrompt(
    'summarize',
    { description: 'summarizes the given text', argsSchema: { text: z.string() } },
    async ({ text }) => ({
      messages: [{ role: 'user', content: { type: 'text', text: `Summarize: ${text}` } }],
    }),
  );

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new McpClient({ name: 'test', version: '1.0.0' });
  await client.connect(clientTransport);

  return { client, server };
}

describe('McpClient resources and prompts', () => {
  let activeClient: McpClient | undefined;
  let activeServer: McpServer | undefined;

  afterEach(async () => {
    await activeClient?.disconnect();
    await activeServer?.close();
    activeClient = undefined;
    activeServer = undefined;
  });

  it('lists resources the server declares', async () => {
    const { client, server } = await startServer();
    activeClient = client;
    activeServer = server;

    const resources = await client.listResources();
    expect(resources.map((r) => r.uri).sort()).toEqual(['file:///README.md', 'file:///logo.png']);
  });

  it('reads a text resource', async () => {
    const { client, server } = await startServer();
    activeClient = client;
    activeServer = server;

    const contents = await client.readResource('file:///README.md');
    expect(contents).toEqual([{ uri: 'file:///README.md', mimeType: 'text/plain', text: '# Lattice', blob: undefined }]);
  });

  it('reads a binary (blob) resource', async () => {
    const { client, server } = await startServer();
    activeClient = client;
    activeServer = server;

    const contents = await client.readResource('file:///logo.png');
    expect(contents[0]).toMatchObject({ uri: 'file:///logo.png', mimeType: 'image/png', blob: 'iVBORw0KGgo=' });
  });

  it('lists prompts the server declares', async () => {
    const { client, server } = await startServer();
    activeClient = client;
    activeServer = server;

    const prompts = await client.listPrompts();
    expect(prompts).toEqual([expect.objectContaining({ name: 'summarize', description: 'summarizes the given text' })]);
  });
});

describe('resourceToMessagePart / resourcesToMessageParts', () => {
  it('converts a text resource into a labelled text part', () => {
    const part = resourceToMessagePart({ uri: 'file:///a.md', mimeType: 'text/plain', text: 'hello' });
    expect(part).toEqual({ type: 'text', text: '[resource file:///a.md]\nhello' });
  });

  it('converts an image blob resource into an image part', () => {
    const part = resourceToMessagePart({ uri: 'file:///a.png', mimeType: 'image/png', blob: 'YWJj' });
    expect(part).toEqual({ type: 'image', dataUrl: 'data:image/png;base64,YWJj', mediaType: 'image/png' });
  });

  it('falls back to a text placeholder for non-image binary content', () => {
    const part = resourceToMessagePart({ uri: 'file:///a.bin', mimeType: 'application/octet-stream', blob: 'AAAA' });
    expect(part).toEqual({
      type: 'text',
      text: '[resource file:///a.bin] binary content (application/octet-stream) not attachable inline',
    });
  });

  it('converts a batch of resources preserving order', () => {
    const parts = resourcesToMessageParts([
      { uri: 'a', text: 'one' },
      { uri: 'b', text: 'two' },
    ]);
    expect(parts).toEqual([
      { type: 'text', text: '[resource a]\none' },
      { type: 'text', text: '[resource b]\ntwo' },
    ]);
  });
});
