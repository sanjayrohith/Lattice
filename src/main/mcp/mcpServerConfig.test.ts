import { describe, expect, it } from 'vitest';
import { mcpServerConfigSchema } from './mcpServerConfig';

describe('mcpServerConfigSchema', () => {
  it('parses a stdio config with defaults for args and env', () => {
    const parsed = mcpServerConfigSchema.parse({
      id: 'server-1',
      displayName: 'Local FS',
      transport: 'stdio',
      command: 'mcp-fs',
    });
    expect(parsed).toMatchObject({ transport: 'stdio', args: [], env: {}, enabled: true });
  });

  it('parses an http config with defaults for headers', () => {
    const parsed = mcpServerConfigSchema.parse({
      id: 'server-2',
      displayName: 'Remote',
      transport: 'http',
      url: 'https://example.test/mcp',
    });
    expect(parsed).toMatchObject({ transport: 'http', headers: {} });
  });

  it('rejects an http config with an invalid url', () => {
    expect(() =>
      mcpServerConfigSchema.parse({ id: 'x', displayName: 'x', transport: 'http', url: 'not-a-url' }),
    ).toThrow();
  });

  it('rejects an unknown transport discriminator', () => {
    expect(() =>
      mcpServerConfigSchema.parse({ id: 'x', displayName: 'x', transport: 'websocket' }),
    ).toThrow();
  });
});
