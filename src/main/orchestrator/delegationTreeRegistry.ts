export type DelegationNodeStatus = 'running' | 'completed' | 'failed';

export interface DelegationNode {
  runId: string;
  parentRunId: string | null;
  agentId: string;
  status: DelegationNodeStatus;
  startedAt: number;
  completedAt: number | null;
  totalTokens: number;
}

/**
 * Records the live delegation hierarchy across every root run: which
 * sub-run was spawned by which parent, its current status, when it
 * started and (once known) finished, and its accumulated token cost.
 * Purely an in-memory index for the delegation tree panel — it is not
 * itself the source of truth for a run's messages or tool calls, only
 * a lightweight structural and status view over the currently
 * (or recently) active delegation tree.
 */
export class DelegationTreeRegistry {
  private readonly nodesByRunId = new Map<string, DelegationNode>();
  private readonly childRunIdsByParent = new Map<string, string[]>();

  addNode(node: Omit<DelegationNode, 'status' | 'completedAt' | 'totalTokens'>): DelegationNode {
    const full: DelegationNode = {
      ...node,
      status: 'running',
      completedAt: null,
      totalTokens: 0,
    };
    this.nodesByRunId.set(node.runId, full);

    if (node.parentRunId) {
      const siblings = this.childRunIdsByParent.get(node.parentRunId) ?? [];
      siblings.push(node.runId);
      this.childRunIdsByParent.set(node.parentRunId, siblings);
    }

    return full;
  }

  setStatus(runId: string, status: DelegationNodeStatus, completedAt?: number): void {
    const node = this.nodesByRunId.get(runId);
    if (!node) return;
    this.nodesByRunId.set(runId, {
      ...node,
      status,
      completedAt: status === 'running' ? null : (completedAt ?? node.completedAt ?? Date.now()),
    });
  }

  addTokens(runId: string, tokens: number): void {
    const node = this.nodesByRunId.get(runId);
    if (!node) return;
    this.nodesByRunId.set(runId, { ...node, totalTokens: node.totalTokens + tokens });
  }

  getNode(runId: string): DelegationNode | undefined {
    return this.nodesByRunId.get(runId);
  }

  /** Every node reachable from `rootRunId` (inclusive), in breadth-first delegation order. */
  getTree(rootRunId: string): DelegationNode[] {
    const root = this.nodesByRunId.get(rootRunId);
    if (!root) return [];

    const result: DelegationNode[] = [];
    const queue: string[] = [rootRunId];

    while (queue.length > 0) {
      const runId = queue.shift() as string;
      const node = this.nodesByRunId.get(runId);
      if (!node) continue;
      result.push(node);
      queue.push(...(this.childRunIdsByParent.get(runId) ?? []));
    }

    return result;
  }

  /** Discards every node reachable from `rootRunId`, e.g. once its top-level run is no longer of interest. */
  releaseTree(rootRunId: string): void {
    for (const node of this.getTree(rootRunId)) {
      this.nodesByRunId.delete(node.runId);
      this.childRunIdsByParent.delete(node.runId);
    }
  }
}
