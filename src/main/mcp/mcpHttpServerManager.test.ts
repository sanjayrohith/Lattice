import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpHttpServerManager } from './mcpHttpServerManager';
import type { McpHttpServerConfig } from './mcpServerConfig';

function config(overrides: Partial<McpHttpServerConfig> = {}): McpHttpServerConfig {
  return {
    id: 'server-1',
    displayName: 'Remote',
    enabled: true,
    transport: 'http',
    url: 'https://mcp.example.test/rpc',
    headers: {},
    consentOverrides: {},
    ...overrides,
  };
}

describe('McpHttpServerManager', () => {
  let manager: McpHttpServerManager | undefined;

  afterEach(async () => {
    await manager?.shutdownAll();
    manager = undefined;
  });

  it('connects and reports running health', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    manager = new McpHttpServerManager({
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

  it('marks the server unavailable when the connection never succeeds', async () => {
    manager = new McpHttpServerManager({
      createTransport: () => {
        throw new Error('ECONNREFUSED');
      },
      supervisorOptions: { maxConsecutiveFailures: 0 },
    });

    await expect(manager.start(config())).rejects.toThrow('ECONNREFUSED');
    expect(manager.getHealth('server-1')?.state).toBe('unavailable');
  });

  it('reconnects after the connection is dropped', async () => {
    let capturedTransport: Transport | undefined;

    manager = new McpHttpServerManager({
      createTransport: () => {
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

    capturedTransport?.onclose?.();
    await vi.waitFor(() => expect(manager?.getHealth('server-1')?.state).toBe('running'));
    expect(manager.getHealth('server-1')?.consecutiveFailures).toBe(0);
  });

  it('disconnects and stops reconnecting on shutdownAll', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    manager = new McpHttpServerManager({
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
