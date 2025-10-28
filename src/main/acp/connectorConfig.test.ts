import { describe, expect, it } from 'vitest';
import { CONNECTOR_PRESETS, ConnectorConfigStore, connectorConfigSchema } from './connectorConfig';

describe('CONNECTOR_PRESETS', () => {
  it('ships presets for codex, gemini, copilot, and claude', () => {
    const ids = CONNECTOR_PRESETS.map((p) => p.id);
    expect(ids).toEqual(['codex-cli', 'gemini-cli', 'copilot-cli', 'claude-agent']);
  });

  it('every preset validates against the schema', () => {
    for (const preset of CONNECTOR_PRESETS) {
      expect(connectorConfigSchema.parse(preset)).toEqual(preset);
    }
  });
});

describe('connectorConfigSchema', () => {
  it('accepts a valid http connector config', () => {
    const parsed = connectorConfigSchema.parse({
      id: 'remote-1',
      displayName: 'Remote Agent',
      transport: 'http',
      url: 'https://agent.example/rpc',
    });
    expect(parsed.transport === 'http' ? parsed.headers : undefined).toEqual({});
    expect(parsed.enabled).toBe(true);
  });

  it('rejects an http connector with an invalid url', () => {
    expect(() =>
      connectorConfigSchema.parse({
        id: 'x',
        displayName: 'x',
        transport: 'http',
        url: 'not-a-url',
      }),
    ).toThrow();
  });
});

describe('ConnectorConfigStore', () => {
  it('seeds from the presets by default', () => {
    const store = new ConnectorConfigStore();
    expect(store.list()).toHaveLength(CONNECTOR_PRESETS.length);
    expect(store.get('codex-cli')?.displayName).toBe('Codex CLI');
  });

  it('upserts, removes, and toggles enabled state', () => {
    const store = new ConnectorConfigStore([]);
    store.upsert(
      connectorConfigSchema.parse({
        id: 'custom',
        displayName: 'Custom',
        transport: 'stdio',
        command: 'my-agent',
      }),
    );
    expect(store.get('custom')?.enabled).toBe(true);

    const disabled = store.setEnabled('custom', false);
    expect(disabled?.enabled).toBe(false);
    expect(store.get('custom')?.enabled).toBe(false);

    expect(store.setEnabled('missing', false)).toBeUndefined();

    expect(store.remove('custom')).toBe(true);
    expect(store.get('custom')).toBeUndefined();
  });
});
