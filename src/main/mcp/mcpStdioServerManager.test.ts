import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpStdioServerManager } from './mcpStdioServerManager';
import type { McpStdioServerConfig } from './mcpServerConfig';

function config(overrides: Partial<McpStdioServerConfig> = {}): McpStdioServerConfig {
  return {
    id: 'server-1',
    displayName: 'Test Server',
    enabled: true,
    transport: 'stdio',
    command: 'mcp-test',
    args: [],
    env: {},
    ...overrides,
  };
}

describe('McpStdioServerManager', () => {
  let manager: McpStdioServerManager | undefined;

  afterEach(async () => {
    await manager?.shutdownAll();
    manager = undefined;
  });

  it('starts a server and reports running health', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    manager = new McpStdioServerManager({
      createTransport: () => {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        void server.connect(serverTransport);
        return clientTransport;
      },
    });

    await manager.start(config());

    expect(manager.getHealth('server-1')).toMatchObject({ state: 'running', consecutiveFailures: 0 });
    expect(manager.getClient('server-1')?.connected).toBe(true);
  });

  it('marks the server unavailable when the process never starts successfully', async () => {
    manager = new McpStdioServerManager({
      createTransport: () => {
        throw new Error('spawn ENOENT');
      },
      supervisorOptions: { maxConsecutiveFailures: 0 },
    });

    await expect(manager.start(config())).rejects.toThrow('spawn ENOENT');
    expect(manager.getHealth('server-1')?.state).toBe('unavailable');
  });

  it('restarts a crashed server with backoff and returns to running', async () => {
    let capturedTransport: Transport | undefined;

    manager = new McpStdioServerManager({
      createTransport: () => {
        // A real respawn gets a fresh process (and thus a fresh server-side connection); model that with a new McpServer per attempt.
        const server = new McpServer({ name: 'test', version: '1.0.0' });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        void server.connect(serverTransport);
        capturedTransport = clientTransport;
        return clientTransport;
      },
      supervisorOptions: { sleep: async () => undefined },
    });

    await manager.start(config());
    expect(manager.getHealth('server-1')?.state).toBe('running');

    // Simulate the process dying: the transport's onclose fires, exactly as it would on a real child-process exit.
    capturedTransport?.onclose?.();
    await vi.waitFor(() => expect(manager?.getHealth('server-1')?.state).toBe('running'));
    expect(manager.getHealth('server-1')?.consecutiveFailures).toBe(0);
  });

  it('disconnects the client and stops restarts on shutdownAll', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    manager = new McpStdioServerManager({
      createTransport: () => {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        void server.connect(serverTransport);
        return clientTransport;
      },
    });

    await manager.start(config());
    await manager.shutdownAll();

    expect(manager.getHealth('server-1')?.state).toBe('stopped');
    expect(manager.getClient('server-1')?.connected).toBe(false);
  });
});
