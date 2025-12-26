import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { ConnectorSupervisor, type ConnectorHealth, type ConnectorSupervisorOptions } from '../acp/connectorSupervisor';
import { McpClient } from './mcpClient';
import type { McpStdioServerConfig } from './mcpServerConfig';

export interface McpStdioServerManagerOptions {
  /** Injectable transport factory so tests can substitute an in-memory transport instead of spawning a real process. */
  createTransport?: (config: McpStdioServerConfig) => Transport;
  /** Forwarded to each server's {@link ConnectorSupervisor} — backoff tuning, injectable sleep for tests, etc. */
  supervisorOptions?: Omit<ConnectorSupervisorOptions, 'start'>;
}

function defaultTransport(config: McpStdioServerConfig): Transport {
  return new StdioClientTransport({ command: config.command, args: config.args, env: config.env });
}

/**
 * Manages the process lifecycle of every configured stdio MCP server:
 * spawns each one behind an {@link McpClient}, tracks health and
 * restarts a crashed process with capped exponential backoff via
 * {@link ConnectorSupervisor} — the exact mechanism ACP connectors use
 * (`feat(acp): supervise connector processes`) — and offers a single
 * `shutdownAll` for a clean exit on app quit.
 */
export class McpStdioServerManager {
  private readonly clients = new Map<string, McpClient>();
  private readonly supervisors = new Map<string, ConnectorSupervisor>();
  private readonly createTransport: (config: McpStdioServerConfig) => Transport;

  constructor(private readonly options: McpStdioServerManagerOptions = {}) {
    this.createTransport = options.createTransport ?? defaultTransport;
  }

  /** Starts a configured server for the first time, tracking it under `config.id`. */
  async start(config: McpStdioServerConfig): Promise<void> {
    const client = new McpClient({ name: 'lattice', version: '0.1.0' });
    const supervisor: ConnectorSupervisor = new ConnectorSupervisor(config.id, {
      ...this.options.supervisorOptions,
      start: async () => {
        const transport = this.createTransport(config);
        transport.onclose = () => {
          void supervisor.notifyCrashed(new Error(`mcp server "${config.id}" process exited unexpectedly`));
        };
        await client.connect(transport);
      },
    });

    this.clients.set(config.id, client);
    this.supervisors.set(config.id, supervisor);
    await supervisor.start();
  }

  getHealth(id: string): ConnectorHealth | undefined {
    return this.supervisors.get(id)?.getHealth();
  }

  getClient(id: string): McpClient | undefined {
    return this.clients.get(id);
  }

  listHealth(): ConnectorHealth[] {
    return [...this.supervisors.values()].map((supervisor) => supervisor.getHealth());
  }

  /** Stops one server deliberately — no further automatic restart — and disconnects its client. */
  async stop(id: string): Promise<void> {
    this.supervisors.get(id)?.stop();
    const client = this.clients.get(id);
    if (client) await client.disconnect();
  }

  /** Stops and disconnects every managed server; call on application quit for a clean shutdown. */
  async shutdownAll(): Promise<void> {
    await Promise.all([...this.supervisors.keys()].map((id) => this.stop(id)));
  }
}
