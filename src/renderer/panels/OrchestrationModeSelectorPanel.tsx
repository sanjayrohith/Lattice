import { useEffect, useState } from 'react';
import { IPC_CHANNELS } from '@shared/ipc/channels';

type ModeId = 'chain' | 'parallel' | 'review-critique' | 'swarm';

const MODE_OPTIONS: readonly { id: ModeId; label: string }[] = [
  { id: 'chain', label: 'Sequential Pipeline' },
  { id: 'parallel', label: 'Parallel Dispatch' },
  { id: 'review-critique', label: 'Review / Critique Duo' },
  { id: 'swarm', label: 'Agentic Team Swarm' },
];

interface AgentSummary {
  id: string;
  displayName: string;
}

export interface OrchestrationStartRequest {
  modeId: ModeId;
  agentIds: string[];
  taskDescription: string;
  config: Record<string, unknown>;
}

export interface OrchestrationModeSelectorPanelParams {
  onStart?: (request: OrchestrationStartRequest) => void;
}

/**
 * Lets the user choose an orchestration mode, assign the agents that
 * will participate (in order — the order doubles as chain stage
 * ordering and swarm turn order), and fill in the handful of
 * mode-specific settings each mode actually reads from `config`:
 * round caps for review/critique and swarm, a stall window for swarm,
 * and scoring criteria for parallel dispatch.
 */
export default function OrchestrationModeSelectorPanel(props: {
  params?: OrchestrationModeSelectorPanelParams;
} = {}): React.JSX.Element {
  const [agents, setAgents] = useState<readonly AgentSummary[]>([]);
  const [modeId, setModeId] = useState<ModeId>('chain');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [taskDescription, setTaskDescription] = useState('');
  const [maxRounds, setMaxRounds] = useState(3);
  const [maxTurns, setMaxTurns] = useState(12);
  const [stallWindow, setStallWindow] = useState(0);
  const [criteria, setCriteria] = useState('');

  useEffect(() => {
    if (!window.electronAPI) return;
    let cancelled = false;

    void window.electronAPI.invoke(IPC_CHANNELS.AGENT_LIST, undefined).then((result) => {
      if (!cancelled && result.ok && Array.isArray(result.data.agents)) {
        setAgents(result.data.agents as AgentSummary[]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  function toggleAgent(agentId: string): void {
    setSelectedAgentIds((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId],
    );
  }

  function moveAgent(index: number, direction: -1 | 1): void {
    setSelectedAgentIds((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target] as string, next[index] as string];
      return next;
    });
  }

  function buildConfig(): Record<string, unknown> {
    switch (modeId) {
      case 'review-critique':
        return { maxRounds };
      case 'swarm':
        return { maxTurns, stallWindow };
      case 'parallel':
        return { criteria: criteria.split(',').map((c) => c.trim()).filter(Boolean) };
      case 'chain':
      default:
        return {};
    }
  }

  function handleStart(): void {
    props.params?.onStart?.({
      modeId,
      agentIds: selectedAgentIds,
      taskDescription,
      config: buildConfig(),
    });
  }

  return (
    <div className="panel panel--orchestration-mode-selector">
      <h2 className="orchestration-mode-selector__heading">Orchestration Mode</h2>

      <label htmlFor="orchestration-mode-select">Mode</label>
      <select
        id="orchestration-mode-select"
        value={modeId}
        onChange={(e) => setModeId(e.target.value as ModeId)}
      >
        {MODE_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      <fieldset className="orchestration-mode-selector__agents">
        <legend>Agent assignment</legend>
        {agents.map((agent) => (
          <label key={agent.id} className="orchestration-mode-selector__agent-row">
            <input
              type="checkbox"
              checked={selectedAgentIds.includes(agent.id)}
              onChange={() => toggleAgent(agent.id)}
            />
            {agent.displayName}
          </label>
        ))}
      </fieldset>

      <ol className="orchestration-mode-selector__order" data-testid="agent-order">
        {selectedAgentIds.map((agentId, index) => (
          <li key={agentId}>
            {agentId}
            <button type="button" aria-label={`move ${agentId} up`} onClick={() => moveAgent(index, -1)}>
              ↑
            </button>
            <button type="button" aria-label={`move ${agentId} down`} onClick={() => moveAgent(index, 1)}>
              ↓
            </button>
          </li>
        ))}
      </ol>

      <label htmlFor="task-description">Task description</label>
      <textarea
        id="task-description"
        value={taskDescription}
        onChange={(e) => setTaskDescription(e.target.value)}
      />

      {modeId === 'review-critique' && (
        <label>
          Max rounds
          <input
            type="number"
            value={maxRounds}
            onChange={(e) => setMaxRounds(Number(e.target.value))}
          />
        </label>
      )}

      {modeId === 'swarm' && (
        <>
          <label>
            Max turns
            <input type="number" value={maxTurns} onChange={(e) => setMaxTurns(Number(e.target.value))} />
          </label>
          <label>
            Stall window
            <input
              type="number"
              value={stallWindow}
              onChange={(e) => setStallWindow(Number(e.target.value))}
            />
          </label>
        </>
      )}

      {modeId === 'parallel' && (
        <label>
          Evaluation criteria
          <input value={criteria} onChange={(e) => setCriteria(e.target.value)} placeholder="comma separated" />
        </label>
      )}

      <button type="button" disabled={selectedAgentIds.length === 0} onClick={handleStart}>
        Start
      </button>
    </div>
  );
}
