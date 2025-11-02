import { useEffect, useState } from 'react';
import { IPC_CHANNELS } from '@shared/ipc/channels';

interface DelegationNode {
  runId: string;
  parentRunId: string | null;
  agentId: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  completedAt: number | null;
  totalTokens: number;
}

function elapsedLabel(node: DelegationNode, now: number): string {
  const end = node.completedAt ?? now;
  const seconds = Math.max(0, Math.round((end - node.startedAt) / 1000));
  return `${seconds}s`;
}

function depthOf(nodes: readonly DelegationNode[], node: DelegationNode): number {
  let depth = 0;
  let current: DelegationNode | undefined = node;
  const byId = new Map(nodes.map((n) => [n.runId, n]));
  while (current?.parentRunId) {
    depth += 1;
    current = byId.get(current.parentRunId);
  }
  return depth;
}

export interface DelegationTreePanelParams {
  rootRunId?: string;
  onOpenTranscript?: (runId: string) => void;
}

/**
 * Renders the live delegation hierarchy rooted at a given run: each
 * node's agent, status, elapsed time, and accumulated token cost,
 * indented by its depth in the tree. Clicking a node reports it via
 * `params.onOpenTranscript` so a host layout (e.g. the conversation
 * panel) can navigate to that specific sub-run's transcript.
 * `rootRunId`/`onOpenTranscript` arrive through Dockview's `params`
 * mechanism rather than as ordinary props, since a panel registered in
 * `panelRegistry` is instantiated by Dockview with no control over its
 * call site's prop shape.
 */
export default function DelegationTreePanel(props: {
  params?: DelegationTreePanelParams;
} = {}): React.JSX.Element {
  const rootRunId = props.params?.rootRunId;
  const onOpenTranscript = props.params?.onOpenTranscript;

  const [nodes, setNodes] = useState<readonly DelegationNode[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!rootRunId || !window.electronAPI) return;
    let cancelled = false;

    const poll = (): void => {
      void window.electronAPI.invoke(IPC_CHANNELS.DELEGATION_TREE, { rootRunId }).then((result) => {
        if (!cancelled && result.ok && Array.isArray(result.data.nodes)) {
          setNodes(result.data.nodes as DelegationNode[]);
        }
      });
    };

    poll();
    const interval = setInterval(poll, 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [rootRunId]);

  return (
    <div className="panel panel--delegation-tree">
      <h2 className="delegation-tree__heading">Delegation Tree</h2>
      {!rootRunId ? (
        <p className="delegation-tree__empty">No active run selected.</p>
      ) : (
        <ul className="delegation-tree__list">
          {nodes.map((node) => (
            <li
              key={node.runId}
              className="delegation-tree__row"
              style={{ paddingLeft: `${depthOf(nodes, node) * 16}px` }}
            >
              <button
                type="button"
                className="delegation-tree__node"
                onClick={() => onOpenTranscript?.(node.runId)}
              >
                {node.agentId}
              </button>
              <span
                data-testid={`status-${node.runId}`}
                className={`delegation-tree__status delegation-tree__status--${node.status}`}
              >
                {node.status}
              </span>
              <span data-testid={`elapsed-${node.runId}`} className="delegation-tree__elapsed">
                {elapsedLabel(node, now)}
              </span>
              <span data-testid={`tokens-${node.runId}`} className="delegation-tree__tokens">
                {node.totalTokens} tokens
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
