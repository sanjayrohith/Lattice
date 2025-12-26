import { describe, expect, it, vi } from 'vitest';
import { createHttpTransport, DEFAULT_HTTP_RECONNECTION_OPTIONS } from './mcpHttpTransport';
import type { McpHttpServerConfig } from './mcpServerConfig';

function config(overrides: Partial<McpHttpServerConfig> = {}): McpHttpServerConfig {
  return {
    id: 'server-1',
    displayName: 'Remote',
    enabled: true,
    transport: 'http',
    url: 'https://mcp.example.test/rpc',
    headers: { authorization: 'Bearer secret-token' },
    ...overrides,
  };
}

describe('createHttpTransport', () => {
  it('builds a transport implementing the Transport interface', () => {
    const transport = createHttpTransport(config());
    expect(typeof transport.start).toBe('function');
    expect(typeof transport.close).toBe('function');
  });

  it('sends the configured authentication headers on every request', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network unreachable in test'));
    const transport = createHttpTransport(config(), { fetchImpl });

    await transport.start();
    await transport.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }).catch(() => undefined);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe('https://mcp.example.test/rpc');
    const headers = init.headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer secret-token');
  });

  it('defaults to the standard reconnection backoff when none is given', () => {
    expect(DEFAULT_HTTP_RECONNECTION_OPTIONS.maxRetries).toBeGreaterThan(0);
    expect(DEFAULT_HTTP_RECONNECTION_OPTIONS.initialReconnectionDelay).toBeGreaterThan(0);
  });
});
