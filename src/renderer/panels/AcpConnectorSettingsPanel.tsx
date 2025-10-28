import { useCallback, useEffect, useState } from 'react';
import { IPC_CHANNELS } from '@shared/ipc/channels';

interface ConnectorConfig {
  id: string;
  displayName: string;
  transport: 'stdio' | 'http';
  enabled: boolean;
  command?: string;
  args?: string[];
  url?: string;
}

interface ConnectorHealth {
  connectorId: string;
  state: 'starting' | 'running' | 'restarting' | 'unavailable' | 'stopped';
  consecutiveFailures: number;
  lastError?: string;
}

interface ConnectorEntry {
  config: ConnectorConfig;
  health: ConnectorHealth;
}

/**
 * Settings panel for ACP connectors: lists every configured connector
 * with its live health and negotiated transport, and lets the user
 * enable, disable, or test-connect each one. Adding brand-new
 * connectors beyond the shipped presets is deliberately out of scope
 * for this panel's first cut — presets are edited, not authored from
 * scratch here.
 */
export default function AcpConnectorSettingsPanel(): React.JSX.Element {
  const [entries, setEntries] = useState<readonly ConnectorEntry[]>([]);
  const [pendingId, setPendingId] = useState<string | undefined>(undefined);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; error?: string }>>({});

  const refresh = useCallback(async () => {
    const result = await window.electronAPI.invoke(IPC_CHANNELS.ACP_CONNECTOR_LIST, undefined);
    if (result.ok) {
      setEntries(result.data.connectors as ConnectorEntry[]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void window.electronAPI.invoke(IPC_CHANNELS.ACP_CONNECTOR_LIST, undefined).then((result) => {
      if (!cancelled && result.ok) {
        setEntries(result.data.connectors as ConnectorEntry[]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggle(entry: ConnectorEntry): Promise<void> {
    setPendingId(entry.config.id);
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.ACP_CONNECTOR_SET_ENABLED, {
        id: entry.config.id,
        enabled: !entry.config.enabled,
      });
      await refresh();
    } finally {
      setPendingId(undefined);
    }
  }

  async function handleTest(entry: ConnectorEntry): Promise<void> {
    setPendingId(entry.config.id);
    try {
      const result = await window.electronAPI.invoke(IPC_CHANNELS.ACP_CONNECTOR_TEST, { id: entry.config.id });
      if (result.ok) {
        setTestResults((prev) => ({ ...prev, [entry.config.id]: result.data }));
      }
      await refresh();
    } finally {
      setPendingId(undefined);
    }
  }

  return (
    <div className="panel panel--acp-connectors">
      <h2 className="acp-connectors__heading">ACP Connectors</h2>
      <ul className="acp-connectors__list">
        {entries.map((entry) => {
          const busy = pendingId === entry.config.id;
          const testResult = testResults[entry.config.id];

          return (
            <li key={entry.config.id} className="acp-connectors__row">
              <span className="acp-connectors__name">{entry.config.displayName}</span>
              <span
                data-testid={`transport-${entry.config.id}`}
                className="acp-connectors__transport"
              >
                {entry.config.transport}
              </span>
              <span
                data-testid={`status-${entry.config.id}`}
                className={`acp-connectors__status acp-connectors__status--${entry.health.state}`}
              >
                {entry.health.state}
              </span>
              <button type="button" disabled={busy} onClick={() => void handleToggle(entry)}>
                {entry.config.enabled ? 'Disable' : 'Enable'}
              </button>
              <button type="button" disabled={busy} onClick={() => void handleTest(entry)}>
                Test connection
              </button>
              {testResult ? (
                <span
                  data-testid={`test-result-${entry.config.id}`}
                  className={`acp-connectors__test acp-connectors__test--${testResult.ok ? 'ok' : 'error'}`}
                >
                  {testResult.ok ? 'Connected' : `Failed: ${testResult.error ?? 'unknown error'}`}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
