import { IPC_CHANNELS } from '@shared/ipc/channels';
import { registerHandler } from '../ipc/registerHandler';
import { connectorConfigSchema, type ConnectorConfigStore } from './connectorConfig';
import { ConnectorSupervisor, type ConnectorHealth } from './connectorSupervisor';

/** How a connector is actually brought up when tested or (re)started; injected so tests never spawn a real process. */
export type ConnectorStarter = (connectorId: string) => Promise<void>;

function defaultHealth(connectorId: string): ConnectorHealth {
  return { connectorId, state: 'stopped', consecutiveFailures: 0 };
}

/**
 * Registers the ACP connector settings IPC surface backed by
 * `store`: list every configured connector alongside its live
 * supervised health, create/update, delete, enable/disable, and a
 * one-shot "test connection" that spawns the connector and reports
 * whether it came up.
 */
export function registerConnectorHandlers(store: ConnectorConfigStore, startConnector: ConnectorStarter): void {
  const supervisors = new Map<string, ConnectorSupervisor>();

  function supervisorFor(connectorId: string): ConnectorSupervisor {
    let supervisor = supervisors.get(connectorId);
    if (!supervisor) {
      supervisor = new ConnectorSupervisor(connectorId, { start: () => startConnector(connectorId) });
      supervisors.set(connectorId, supervisor);
    }
    return supervisor;
  }

  registerHandler(IPC_CHANNELS.ACP_CONNECTOR_LIST, () => ({
    connectors: store.list().map((config) => ({
      config,
      health: supervisors.get(config.id)?.getHealth() ?? defaultHealth(config.id),
    })),
  }));

  registerHandler(IPC_CHANNELS.ACP_CONNECTOR_UPSERT, (payload) => {
    const config = connectorConfigSchema.parse(payload.config);
    store.upsert(config);
    return { config };
  });

  registerHandler(IPC_CHANNELS.ACP_CONNECTOR_DELETE, (payload) => {
    const deleted = store.remove(payload.id);
    supervisors.delete(payload.id);
    return { deleted };
  });

  registerHandler(IPC_CHANNELS.ACP_CONNECTOR_SET_ENABLED, (payload) => ({
    config: store.setEnabled(payload.id, payload.enabled) ?? null,
  }));

  registerHandler(IPC_CHANNELS.ACP_CONNECTOR_TEST, async (payload) => {
    const supervisor = supervisorFor(payload.id);
    try {
      await supervisor.start();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
