import { describe, expect, it } from 'vitest';
import { configVersionOf, McpToolDiscoveryCache } from './mcpToolCache';

const TOOLS = [{ name: 'echo', description: '', inputSchema: {} }];

describe('McpToolDiscoveryCache', () => {
  it('misses before anything is cached', () => {
    const cache = new McpToolDiscoveryCache();
    expect(cache.get('server-1', 'v1')).toBeUndefined();
  });

  it('serves a cached hit within the ttl for the same config version', () => {
    let now = 0;
    const cache = new McpToolDiscoveryCache(1000, () => now);
    cache.set('server-1', TOOLS, 'v1');

    now = 500;
    expect(cache.get('server-1', 'v1')).toEqual(TOOLS);
  });

  it('misses once the ttl has elapsed', () => {
    let now = 0;
    const cache = new McpToolDiscoveryCache(1000, () => now);
    cache.set('server-1', TOOLS, 'v1');

    now = 1000;
    expect(cache.get('server-1', 'v1')).toBeUndefined();
  });

  it('misses when the config version has changed since the entry was cached', () => {
    const cache = new McpToolDiscoveryCache();
    cache.set('server-1', TOOLS, 'v1');
    expect(cache.get('server-1', 'v2')).toBeUndefined();
  });

  it('invalidate forces the next lookup for that server to miss', () => {
    const cache = new McpToolDiscoveryCache();
    cache.set('server-1', TOOLS, 'v1');
    cache.invalidate('server-1');
    expect(cache.get('server-1', 'v1')).toBeUndefined();
  });

  it('invalidateAll clears every server', () => {
    const cache = new McpToolDiscoveryCache();
    cache.set('server-1', TOOLS, 'v1');
    cache.set('server-2', TOOLS, 'v1');
    cache.invalidateAll();
    expect(cache.get('server-1', 'v1')).toBeUndefined();
    expect(cache.get('server-2', 'v1')).toBeUndefined();
  });
});

describe('configVersionOf', () => {
  it('produces the same fingerprint for identical configs', () => {
    const a = { id: 'x', command: 'foo', args: [] };
    const b = { id: 'x', command: 'foo', args: [] };
    expect(configVersionOf(a)).toBe(configVersionOf(b));
  });

  it('produces a different fingerprint when any field changes', () => {
    expect(configVersionOf({ command: 'foo' })).not.toBe(configVersionOf({ command: 'bar' }));
  });
});
