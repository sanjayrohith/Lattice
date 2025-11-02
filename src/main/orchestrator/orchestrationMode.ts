/** The inputs common to every orchestration mode's run, regardless of how it plans or executes. */
export interface OrchestrationModeRequest {
  modeId: string;
  rootRunId: string;
  agentIds: readonly string[];
  taskDescription: string;
  config?: Record<string, unknown>;
}

/** The final, mode-agnostic outcome every mode's `summarize` must converge on. */
export interface OrchestrationModeResult {
  output: string;
  details?: unknown;
}

/**
 * A pluggable multi-agent orchestration strategy (sequential pipeline,
 * parallel dispatch, review/critique duo, swarm, ...), expressed as
 * three hooks a dispatcher drives in order:
 *
 * - `plan` turns the request into a mode-specific execution plan (e.g.
 *   a stage ordering, or a fan-out agent list) without running anything.
 * - `execute` carries out that plan, producing a mode-specific result
 *   shape (its own details are opaque to the dispatcher).
 * - `summarize` reduces that result to the common
 *   {@link OrchestrationModeResult} every mode ultimately reports
 *   through, regardless of how differently it got there.
 *
 * `TPlan` and `TExecuteResult` are intentionally mode-specific generics
 * rather than a single shared shape — a chain mode's plan (an ordered
 * stage list) and a swarm mode's plan (turn-taking rules) have nothing
 * in common beyond both being "a plan".
 */
export interface OrchestrationMode<TPlan = unknown, TExecuteResult = unknown> {
  id: string;
  plan(request: OrchestrationModeRequest): Promise<TPlan> | TPlan;
  execute(request: OrchestrationModeRequest, plan: TPlan): Promise<TExecuteResult> | TExecuteResult;
  summarize(
    request: OrchestrationModeRequest,
    executeResult: TExecuteResult,
  ): Promise<OrchestrationModeResult> | OrchestrationModeResult;
}

/** A type-erased mode as held by the registry, mirroring `AnyTool`'s role for the tool registry. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous collection boundary, see AnyTool
export type AnyOrchestrationMode = OrchestrationMode<any, any>;

/** Thrown when a request names a `modeId` with no registered implementation. */
export class UnknownOrchestrationModeError extends Error {
  constructor(public readonly modeId: string) {
    super(`no orchestration mode registered for id "${modeId}"`);
    this.name = 'UnknownOrchestrationModeError';
  }
}

/** Holds every orchestration mode implementation the application knows how to run, keyed by id. */
export class OrchestrationModeRegistry {
  private readonly modesById = new Map<string, AnyOrchestrationMode>();

  register(mode: AnyOrchestrationMode): void {
    this.modesById.set(mode.id, mode);
  }

  get(id: string): AnyOrchestrationMode | undefined {
    return this.modesById.get(id);
  }

  list(): AnyOrchestrationMode[] {
    return [...this.modesById.values()];
  }

  /** Looks up `id`, throwing {@link UnknownOrchestrationModeError} rather than returning `undefined`. */
  require(id: string): AnyOrchestrationMode {
    const mode = this.get(id);
    if (!mode) throw new UnknownOrchestrationModeError(id);
    return mode;
  }
}

/**
 * Selects the implementation named by `request.modeId` and drives its
 * three hooks in order, returning the common result shape every mode
 * converges on. This is the single entry point the rest of the
 * orchestrator calls to run any mode — nothing downstream needs to
 * know which concrete mode it invoked.
 */
export async function dispatchOrchestrationMode(
  registry: OrchestrationModeRegistry,
  request: OrchestrationModeRequest,
): Promise<OrchestrationModeResult> {
  const mode = registry.require(request.modeId);
  const plan = await mode.plan(request);
  const executeResult = await mode.execute(request, plan);
  return mode.summarize(request, executeResult);
}
