import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { ConnectorHealth } from '../acp/connectorSupervisor';
import { registerHandler } from '../ipc/registerHandler';
import type { McpServerRepository } from '../db/repositories/mcpServerRepository';
import type { McpClient } from './mcpClient';
import { discoverMcpTools } from './mcpToolDiscovery';
import type { McpHttpServerManager } from './mcpHttpServerManager';
import type { McpServerConfig } from './mcpServerConfig';
import type { McpStdioServerManager } from './mcpStdioServerManager';

export interface McpServerHandlerOptions {
  repository: McpServerRepository;
  stdioManager: McpStdioServerManager;
  httpManager: McpHttpServerManager;
}

function stoppedHealth(id: string): ConnectorHealth {
  return { connectorId: id, state: 'stopped', consecutiveFailures: 0 };
}

/**
 * Registers the MCP server manager panel's IPC surface: list every
 * configured server with its live health, create/update, delete,
 * enable/disable (which connects or disconnects the underlying stdio or
 * http manager to match), inspect a connected server's discovered tools
 * and resources, and set a per-tool consent override. Enabling or
 * updating a server (re)starts it fire-and-forget — a failed connection
 * surfaces through its health state on the next list call rather than
 * rejecting the upsert itself, since the config is valid even if the
 * server is currently unreachable.
 */
export function registerMcpServerHandlers(options: McpServerHandlerOptions): void {
  const { repository, stdioManager, httpManager } = options;

  function getClient(id: string): McpClient | undefined {
    return stdioManager.getClient(id) ?? httpManager.getClient(id);
  }

  function getHealth(id: string): ConnectorHealth {
    return stdioManager.getHealth(id) ?? httpManager.getHealth(id) ?? stoppedHealth(id);
  }

  async function applyEnabledState(config: McpServerConfig): Promise<void> {
    if (!config.enabled) {
      await stdioManager.stop(config.id);
      await httpManager.stop(config.id);
      return;
    }

    if (config.transport === 'stdio') {
      await stdioManager.start(config).catch(() => undefined);
    } else {
      await httpManager.start(config).catch(() => undefined);
    }
  }

  registerHandler(IPC_CHANNELS.MCP_SERVER_LIST, () => ({
    servers: repository.list().map((config) => ({ config, health: getHealth(config.id) })),
  }));

  registerHandler(IPC_CHANNELS.MCP_SERVER_UPSERT, async (payload) => {
    const saved = repository.upsert(payload.config);
    await applyEnabledState(saved);
    return { config: saved };
  });

  registerHandler(IPC_CHANNELS.MCP_SERVER_DELETE, async (payload) => {
    await stdioManager.stop(payload.id);
    await httpManager.stop(payload.id);
    return { deleted: repository.delete(payload.id) };
  });

  registerHandler(IPC_CHANNELS.MCP_SERVER_SET_ENABLED, async (payload) => {
    const updated = repository.update(payload.id, { enabled: payload.enabled });
    if (updated) await applyEnabledState(updated);
    return { config: updated ?? null };
  });

  registerHandler(IPC_CHANNELS.MCP_SERVER_INSPECT, async (payload) => {
    const config = repository.findById(payload.id);
    const client = getClient(payload.id);
    if (!config || !client?.connected) return { tools: [], resources: [] };

    const discovered = await discoverMcpTools([config], getClient);
    const resources = await client.listResources().catch(() => []);

    return { tools: discovered.map((d) => d.descriptor), resources };
  });

  registerHandler(IPC_CHANNELS.MCP_SERVER_SET_TOOL_CONSENT, (payload) => {
    const existing = repository.findById(payload.id);
    if (!existing) return { config: null };

    const config = repository.update(payload.id, {
      consentOverrides: { ...existing.consentOverrides, [payload.toolName]: payload.policy },
    });
    return { config: config ?? null };
  });
}
