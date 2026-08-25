import { useCallback, useEffect, useState } from 'react';
import { IPC_CHANNELS } from '@shared/ipc/channels';

type ConsentPolicy = 'always' | 'ask' | 'never';

interface McpServerConfig {
  id: string;
  displayName: string;
  enabled: boolean;
  transport: 'stdio' | 'http';
  command?: string;
  url?: string;
  consentOverrides: Record<string, ConsentPolicy>;
}

interface McpServerHealth {
  connectorId: string;
  state: 'starting' | 'running' | 'restarting' | 'unavailable' | 'stopped';
  consecutiveFailures: number;
  lastError?: string;
}

interface McpServerEntry {
  config: McpServerConfig;
  health: McpServerHealth;
}

interface McpInspectTool {
  name: string;
  description: string;
}

interface McpInspectResource {
  uri: string;
  name: string;
}

const CONSENT_POLICIES: readonly ConsentPolicy[] = ['always', 'ask', 'never'];

function newServerId(): string {
  return `mcp-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Settings panel for MCP servers: add, enable, disable, and remove
 * server configurations; inspect a connected server's discovered tools
 * and resources; and set a per-tool consent override that feeds
 * `toMcpAnyTool`'s `defaultConsent` resolution.
 */
export default function McpServerManagerPanel(): React.JSX.Element {
  const [entries, setEntries] = useState<readonly McpServerEntry[]>([]);
  const [pendingId, setPendingId] = useState<string | undefined>(undefined);
  const [inspectedId, setInspectedId] = useState<string | undefined>(undefined);
  const [inspection, setInspection] = useState<{ tools: McpInspectTool[]; resources: McpInspectResource[] } | undefined>(
    undefined,
  );
  const [newCommand, setNewCommand] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');

  const refresh = useCallback(async () => {
    const result = await window.electronAPI.invoke(IPC_CHANNELS.MCP_SERVER_LIST, undefined);
    if (result.ok) setEntries(result.data.servers as McpServerEntry[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void window.electronAPI.invoke(IPC_CHANNELS.MCP_SERVER_LIST, undefined).then((result) => {
      if (!cancelled && result.ok) setEntries(result.data.servers as McpServerEntry[]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAdd(): Promise<void> {
    if (!newCommand.trim() || !newDisplayName.trim()) return;
    await window.electronAPI.invoke(IPC_CHANNELS.MCP_SERVER_UPSERT, {
      config: {
        id: newServerId(),
        displayName: newDisplayName,
        enabled: true,
        transport: 'stdio',
        command: newCommand,
        args: [],
        env: {},
        consentOverrides: {},
      },
    });
    setNewCommand('');
    setNewDisplayName('');
    await refresh();
  }

  async function handleToggle(entry: McpServerEntry): Promise<void> {
    setPendingId(entry.config.id);
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.MCP_SERVER_SET_ENABLED, {
        id: entry.config.id,
        enabled: !entry.config.enabled,
      });
      await refresh();
    } finally {
      setPendingId(undefined);
    }
  }

  async function handleRemove(entry: McpServerEntry): Promise<void> {
    setPendingId(entry.config.id);
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.MCP_SERVER_DELETE, { id: entry.config.id });
      if (inspectedId === entry.config.id) {
        setInspectedId(undefined);
        setInspection(undefined);
      }
      await refresh();
    } finally {
      setPendingId(undefined);
    }
  }

  async function handleInspect(entry: McpServerEntry): Promise<void> {
    setInspectedId(entry.config.id);
    const result = await window.electronAPI.invoke(IPC_CHANNELS.MCP_SERVER_INSPECT, { id: entry.config.id });
    if (result.ok) {
      setInspection(result.data as { tools: McpInspectTool[]; resources: McpInspectResource[] });
    }
  }

  async function handleSetConsent(toolName: string, policy: ConsentPolicy): Promise<void> {
    if (!inspectedId) return;
    await window.electronAPI.invoke(IPC_CHANNELS.MCP_SERVER_SET_TOOL_CONSENT, { id: inspectedId, toolName, policy });
    await refresh();
  }

  const inspectedConfig = entries.find((e) => e.config.id === inspectedId)?.config;

  return (
    <div className="panel panel--mcp-servers">
      <h2 className="mcp-servers__heading">MCP Servers</h2>

      <div className="mcp-servers__add-form">
        <input
          placeholder="Display name"
          value={newDisplayName}
          onChange={(event) => setNewDisplayName(event.target.value)}
        />
        <input placeholder="Command" value={newCommand} onChange={(event) => setNewCommand(event.target.value)} />
        <button type="button" onClick={() => void handleAdd()}>
          Add Server
        </button>
      </div>

      <ul className="mcp-servers__list">
        {entries.map((entry) => {
          const busy = pendingId === entry.config.id;
          return (
            <li key={entry.config.id} className="mcp-servers__row">
              <span className="mcp-servers__name">{entry.config.displayName}</span>
              <span data-testid={`transport-${entry.config.id}`} className="mcp-servers__transport">
                {entry.config.transport}
              </span>
              <span
                data-testid={`status-${entry.config.id}`}
                className={`mcp-servers__status mcp-servers__status--${entry.health.state}`}
              >
                {entry.health.state}
              </span>
              <button type="button" disabled={busy} onClick={() => void handleToggle(entry)}>
                {entry.config.enabled ? 'Disable' : 'Enable'}
              </button>
              <button type="button" disabled={busy} onClick={() => void handleInspect(entry)}>
                Inspect
              </button>
              <button type="button" disabled={busy} onClick={() => void handleRemove(entry)}>
                Remove
              </button>
            </li>
          );
        })}
      </ul>

      {inspectedId && inspection && (
        <div className="mcp-servers__inspection">
          <h3>Tools</h3>
          <ul>
            {inspection.tools.map((tool) => (
              <li key={tool.name} data-testid={`tool-${tool.name}`}>
                <span>{tool.name}</span>
                <select
                  data-testid={`consent-${tool.name}`}
                  value={inspectedConfig?.consentOverrides[tool.name] ?? 'ask'}
                  onChange={(event) => void handleSetConsent(tool.name, event.target.value as ConsentPolicy)}
                >
                  {CONSENT_POLICIES.map((policy) => (
                    <option key={policy} value={policy}>
                      {policy}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          <h3>Resources</h3>
          <ul>
            {inspection.resources.map((resource) => (
              <li key={resource.uri}>{resource.name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
