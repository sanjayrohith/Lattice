import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

export interface MockMcpServerHandle {
  server: McpServer;
  /** A fresh, already-connected client-side transport ready to hand to {@link McpClient.connect}. */
  clientTransport: Transport;
  close(): Promise<void>;
}

/**
 * An in-repo mock MCP server exposing a single `greet` tool, for
 * exercising the full MCP pipeline — discovery, namespacing, schema
 * derivation, consent, invocation, and reinjection — end to end in tests
 * without spawning a real process or touching the network. Connected via
 * {@link InMemoryTransport} rather than stdio or HTTP, since this fixture
 * exists to validate the pipeline downstream of transport, not the
 * transport itself (already covered by `mcpStdioServerManager.test.ts`
 * and `mcpHttpServerManager.test.ts`).
 */
export async function createMockMcpServer(): Promise<MockMcpServerHandle> {
  const server = new McpServer({ name: 'mock-mcp-server', version: '1.0.0' });

  server.registerTool(
    'greet',
    {
      description: 'greets the given name',
      inputSchema: { name: z.string().describe('the name to greet') },
    },
    async ({ name }: { name: string }) => ({
      content: [{ type: 'text', text: `Hello, ${name}!` }],
    }),
  );

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  return {
    server,
    clientTransport,
    close: () => server.close(),
  };
}
