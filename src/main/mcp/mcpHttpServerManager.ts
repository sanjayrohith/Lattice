import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { ConnectorSupervisor, type ConnectorHealth, type ConnectorSupervisorOptions } from '../acp/connectorSupervisor';
import { createHttpTransport, type CreateHttpTransportOptions } from './mcpHttpTransport';
import { McpClient } from './mcpClient';
import type { McpHttpServerConfig } from './mcpServerConfig';

export interface McpHttpServerManagerOptions {
  /** Injectable transport factory so tests can substitute a controllable transport instead of a real HTTP connection. */
  createTransport?: (config: McpHttpServerConfig) => Transport;
  createTransportOptions?: CreateHttpTransportOptions;
  /** Forwarded to each server's {@link ConnectorSupervisor} — backoff tuning, injectable sleep for tests, etc. */
  supervisorOptions?: Omit<ConnectorSupervisorOptions, 'start'>;
}

/**
 * Manages the connection lifecycle of every configured remote MCP
 * server, mirroring {@link McpStdioServerManager}'s shape so the two
 * transports are interchangeable from the connector supervisor's point
 * of view. `StreamableHTTPClientTransport` already retries a dropped SSE
 * stream on its own (`createHttpTransport`'s reconnection options); this
 * layer handles the coarser case — the initial connection, or a session,
 * failing outright — with the same {@link ConnectorSupervisor} backoff
 * ACP connectors and stdio MCP servers use.
 */
export class McpHttpServerManager {
  private readonly clients = new Map<string, McpClient>();
  private readonly supervisors = new Map<string, ConnectorSupervisor>();
  private readonly createTransport: (config: McpHttpServerConfig) => Transport;

  constructor(private readonly options: McpHttpServerManagerOptions = {}) {
    this.createTransport =
      options.createTransport ?? ((config) => createHttpTransport(config, options.createTransportOptions));
  }

  async start(config: McpHttpServerConfig): Promise<void> {
    const client = new McpClient({ name: 'lattice', version: '0.1.0' });
    const supervisor: ConnectorSupervisor = new ConnectorSupervisor(config.id, {
      ...this.options.supervisorOptions,
      start: async () => {
        const transport = this.createTransport(config);
        transport.onclose = () => {
          void supervisor.notifyCrashed(new Error(`mcp server "${config.id}" connection closed unexpectedly`));
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

  async stop(id: string): Promise<void> {
    this.supervisors.get(id)?.stop();
    const client = this.clients.get(id);
    if (client) await client.disconnect();
  }

  async shutdownAll(): Promise<void> {
    await Promise.all([...this.supervisors.keys()].map((id) => this.stop(id)));
  }
}
