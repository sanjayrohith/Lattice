import { z } from 'zod';

/**
 * The configuration schema for one ACP connector: either a stdio
 * connector, spawning a local agent CLI as a child process, or an HTTP
 * connector, calling a remote agent endpoint.
 */
export const connectorConfigSchema = z.discriminatedUnion('transport', [
  z.object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    transport: z.literal('stdio'),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    env: z.record(z.string(), z.string()).default({}),
    cwd: z.string().optional(),
    enabled: z.boolean().default(true),
  }),
  z.object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    transport: z.literal('http'),
    url: z.string().url(),
    headers: z.record(z.string(), z.string()).default({}),
    enabled: z.boolean().default(true),
  }),
]);
export type ConnectorConfig = z.infer<typeof connectorConfigSchema>;

/**
 * Ready-to-use connector presets for the ACP-capable agent CLIs the
 * orchestrator ships first-class support for. Each preset is a
 * template — `id` is stable so a user's enable/disable and env
 * overrides persist across app upgrades, but `env`/`args` are safe
 * defaults a user is expected to adjust (e.g. supplying an API key).
 */
export const CONNECTOR_PRESETS: readonly ConnectorConfig[] = [
  connectorConfigSchema.parse({
    id: 'codex-cli',
    displayName: 'Codex CLI',
    transport: 'stdio',
    command: 'codex',
    args: ['acp'],
  }),
  connectorConfigSchema.parse({
    id: 'gemini-cli',
    displayName: 'Gemini CLI',
    transport: 'stdio',
    command: 'gemini',
    args: ['--acp'],
  }),
  connectorConfigSchema.parse({
    id: 'copilot-cli',
    displayName: 'Copilot CLI',
    transport: 'stdio',
    command: 'copilot',
    args: ['acp'],
  }),
  connectorConfigSchema.parse({
    id: 'claude-agent',
    displayName: 'Claude Agent',
    transport: 'stdio',
    command: 'claude-agent-wrapper',
    args: ['--acp'],
  }),
];

/**
 * Holds the set of configured connectors, keyed by id, seeded from
 * {@link CONNECTOR_PRESETS} and mutable thereafter (add/update/remove/
 * enable/disable) as the settings panel edits them.
 */
export class ConnectorConfigStore {
  private readonly connectors = new Map<string, ConnectorConfig>();

  constructor(seed: readonly ConnectorConfig[] = CONNECTOR_PRESETS) {
    for (const connector of seed) {
      this.connectors.set(connector.id, connector);
    }
  }

  upsert(config: ConnectorConfig): void {
    this.connectors.set(config.id, config);
  }

  get(id: string): ConnectorConfig | undefined {
    return this.connectors.get(id);
  }

  remove(id: string): boolean {
    return this.connectors.delete(id);
  }

  list(): ConnectorConfig[] {
    return [...this.connectors.values()];
  }

  setEnabled(id: string, enabled: boolean): ConnectorConfig | undefined {
    const existing = this.connectors.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, enabled };
    this.connectors.set(id, updated);
    return updated;
  }
}
