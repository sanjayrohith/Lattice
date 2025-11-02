/** The default hard cap on delegation depth, absent an explicit override. */
export const DEFAULT_MAX_DELEGATION_DEPTH = 5;

/** Thrown when a delegation would re-enter an agent already active earlier in the same chain. */
export class DelegationCycleError extends Error {
  readonly code = 'DELEGATION_CYCLE';

  constructor(
    public readonly agentId: string,
    public readonly chain: readonly string[],
  ) {
    super(`agent "${agentId}" is already active in the current delegation chain: ${[...chain, agentId].join(' -> ')}`);
    this.name = 'DelegationCycleError';
  }
}

/** Thrown when a delegation would extend a chain past the configured maximum depth. */
export class DelegationDepthExceededError extends Error {
  readonly code = 'DELEGATION_DEPTH_EXCEEDED';

  constructor(public readonly maxDepth: number) {
    super(`delegation depth exceeds the configured maximum of ${maxDepth}`);
    this.name = 'DelegationDepthExceededError';
  }
}

/**
 * Tracks, per top-level run, the chain of agent ids currently active
 * along the delegation path that led to the run's present point of
 * execution — root agent first, most recently delegated-to agent last.
 * A run that has never delegated has no tracked chain until its root
 * agent id is registered via {@link begin}.
 */
export class DelegationChainTracker {
  private readonly chainsByRunId = new Map<string, string[]>();

  constructor(private readonly maxDepth: number = DEFAULT_MAX_DELEGATION_DEPTH) {}

  /** Registers `rootAgentId` as the start of `runId`'s chain. Idempotent if already begun. */
  begin(runId: string, rootAgentId: string): readonly string[] {
    const existing = this.chainsByRunId.get(runId);
    if (existing) return existing;
    const chain = [rootAgentId];
    this.chainsByRunId.set(runId, chain);
    return chain;
  }

  getChain(runId: string): readonly string[] {
    return this.chainsByRunId.get(runId) ?? [];
  }

  /**
   * Extends `runId`'s chain with `targetAgentId`, after checking it does
   * not already appear in the chain (a cycle) and that doing so would
   * not exceed the configured maximum depth. Returns the new chain on
   * success; throws {@link DelegationCycleError} or
   * {@link DelegationDepthExceededError} otherwise, leaving the tracked
   * chain unchanged.
   */
  extend(runId: string, targetAgentId: string): readonly string[] {
    const chain = this.getChain(runId);

    if (chain.includes(targetAgentId)) {
      throw new DelegationCycleError(targetAgentId, chain);
    }
    if (chain.length >= this.maxDepth) {
      throw new DelegationDepthExceededError(this.maxDepth);
    }

    const next = [...chain, targetAgentId];
    this.chainsByRunId.set(runId, next);
    return next;
  }

  /** Releases the tracked chain for `runId`, e.g. once its top-level run completes. */
  release(runId: string): void {
    this.chainsByRunId.delete(runId);
  }
}
