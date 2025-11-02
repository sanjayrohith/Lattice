import { useEffect, useState } from 'react';
import { IPC_CHANNELS } from '@shared/ipc/channels';

type AgentBackendRef =
  | { kind: 'sdk'; modelConfig: { providerId: string; modelId: string } }
  | { kind: 'acp'; connectorId: string };

interface AgentProfile {
  id: string;
  displayName: string;
  backend: AgentBackendRef;
  systemPrompt: string;
  stepBudget: number;
  role: AgentRole;
}

interface ConnectorHealth {
  connectorId: string;
  state: 'starting' | 'running' | 'restarting' | 'unavailable' | 'stopped';
}

type Availability = 'available' | 'unavailable' | 'checking';

type AgentRole =
  | 'worker'
  | 'orchestrator'
  | 'project-manager'
  | 'architect'
  | 'developer'
  | 'devops'
  | 'reviewer'
  | 'critic';

interface EditableFields {
  displayName: string;
  systemPrompt: string;
  stepBudget: number;
  role: AgentRole;
}

function availabilityFor(agent: AgentProfile, connectorHealthById: ReadonlyMap<string, ConnectorHealth>): Availability {
  if (agent.backend.kind === 'sdk') return 'available';
  const health = connectorHealthById.get(agent.backend.connectorId);
  if (!health) return 'checking';
  if (health.state === 'running') return 'available';
  if (health.state === 'starting' || health.state === 'restarting') return 'checking';
  return 'unavailable';
}

/**
 * Lists every configured agent with a backend badge (`sdk` model id, or
 * `acp` connector id and its live health), an availability indicator
 * derived from that backend, and inline editing of the profile fields
 * that matter day to day: display name, system prompt, step budget,
 * and orchestration role.
 */
export default function AgentRosterPanel(): React.JSX.Element {
  const [agents, setAgents] = useState<readonly AgentProfile[]>([]);
  const [connectorHealthById, setConnectorHealthById] = useState<ReadonlyMap<string, ConnectorHealth>>(new Map());
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [drafts, setDrafts] = useState<Record<string, EditableFields>>({});

  useEffect(() => {
    if (!window.electronAPI) return;
    let cancelled = false;

    void window.electronAPI.invoke(IPC_CHANNELS.AGENT_LIST, undefined).then((result) => {
      if (!cancelled && result.ok && Array.isArray(result.data.agents)) {
        setAgents(result.data.agents as AgentProfile[]);
      }
    });

    void window.electronAPI.invoke(IPC_CHANNELS.ACP_CONNECTOR_LIST, undefined).then((result) => {
      if (!cancelled && result.ok && Array.isArray(result.data.connectors)) {
        const entries = result.data.connectors as { health: ConnectorHealth }[];
        setConnectorHealthById(new Map(entries.map((e) => [e.health.connectorId, e.health])));
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  function startEditing(agent: AgentProfile): void {
    setEditingId(agent.id);
    setDrafts((prev) => ({
      ...prev,
      [agent.id]: { displayName: agent.displayName, systemPrompt: agent.systemPrompt, stepBudget: agent.stepBudget, role: agent.role },
    }));
  }

  function cancelEditing(): void {
    setEditingId(undefined);
  }

  async function saveEditing(agentId: string): Promise<void> {
    const draft = drafts[agentId];
    if (!draft) return;

    const result = await window.electronAPI.invoke(IPC_CHANNELS.AGENT_UPDATE, {
      id: agentId,
      patch: draft,
    });
    if (result.ok && result.data.agent) {
      const updated = result.data.agent as AgentProfile;
      setAgents((prev) => prev.map((a) => (a.id === agentId ? updated : a)));
    }
    setEditingId(undefined);
  }

  function updateDraft(agentId: string, patch: Partial<EditableFields>): void {
    setDrafts((prev) => ({
      ...prev,
      [agentId]: { ...prev[agentId], ...patch } as EditableFields,
    }));
  }

  return (
    <div className="panel panel--agent-roster">
      <h2 className="agent-roster__heading">Agent Roster</h2>
      <ul className="agent-roster__list">
        {agents.map((agent) => {
          const isEditing = editingId === agent.id;
          const draft = drafts[agent.id];
          const availability = availabilityFor(agent, connectorHealthById);

          return (
            <li key={agent.id} className="agent-roster__row">
              <span
                data-testid={`backend-${agent.id}`}
                className={`agent-roster__backend agent-roster__backend--${agent.backend.kind}`}
              >
                {agent.backend.kind === 'sdk' ? agent.backend.modelConfig.modelId : agent.backend.connectorId}
              </span>
              <span
                data-testid={`availability-${agent.id}`}
                className={`agent-roster__availability agent-roster__availability--${availability}`}
              >
                {availability}
              </span>

              {isEditing ? (
                <>
                  <input
                    aria-label={`${agent.displayName} display name`}
                    value={draft?.displayName ?? agent.displayName}
                    onChange={(e) => updateDraft(agent.id, { displayName: e.target.value })}
                  />
                  <input
                    aria-label={`${agent.displayName} system prompt`}
                    value={draft?.systemPrompt ?? agent.systemPrompt}
                    onChange={(e) => updateDraft(agent.id, { systemPrompt: e.target.value })}
                  />
                  <input
                    type="number"
                    aria-label={`${agent.displayName} step budget`}
                    value={draft?.stepBudget ?? agent.stepBudget}
                    onChange={(e) => updateDraft(agent.id, { stepBudget: Number(e.target.value) })}
                  />
                  <button type="button" onClick={() => void saveEditing(agent.id)}>
                    Save
                  </button>
                  <button type="button" onClick={cancelEditing}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="agent-roster__name">{agent.displayName}</span>
                  <button type="button" onClick={() => startEditing(agent)}>
                    Edit
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
