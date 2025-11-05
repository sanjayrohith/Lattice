import type { OrchestrationMode, OrchestrationModeRequest, OrchestrationModeResult } from './orchestrationMode';
import { evaluateParallelCandidates, type CandidateScorer } from './parallelEvaluation';

export interface ParallelCandidate {
  agentId: string;
  ok: boolean;
  output: string;
  error?: string;
}

export interface ParallelExecuteResult {
  candidates: ParallelCandidate[];
}

/** Runs the identical task against `agentId` in isolation; rejects on that agent's own failure. */
export type ParallelAgentRunner = (params: { agentId: string; input: string; signal: AbortSignal }) => Promise<string>;

/**
 * The parallel dispatch orchestration mode: sends the exact same task
 * to every agent in `agentIds` concurrently, each with its own
 * independent `AbortController` so cancelling — or one agent
 * crashing — never touches the others, and aggregates every outcome
 * (success or failure) once all have settled.
 *
 * When constructed with a `scorer`, `summarize` additionally runs the
 * evaluation stage (`evaluateParallelCandidates`): every successful
 * candidate is scored against `request.config.criteria` and the
 * highest-scoring one is auto-selected as the reported output, with
 * every other successful candidate retained — never discarded — as an
 * alternate in `details`. With no `scorer` configured, `summarize`
 * falls back to reporting every candidate's outcome without picking a
 * winner.
 */
export class ParallelMode implements OrchestrationMode<string[], ParallelExecuteResult> {
  readonly id = 'parallel';

  constructor(
    private readonly runAgent: ParallelAgentRunner,
    private readonly scorer?: CandidateScorer,
  ) {}

  plan(request: OrchestrationModeRequest): string[] {
    return [...request.agentIds];
  }

  async execute(request: OrchestrationModeRequest, plan: string[]): Promise<ParallelExecuteResult> {
    const controllers = plan.map(() => new AbortController());

    const settled = await Promise.allSettled(
      plan.map((agentId, index) =>
        this.runAgent({ agentId, input: request.taskDescription, signal: controllers[index]!.signal }),
      ),
    );

    const candidates: ParallelCandidate[] = settled.map((outcome, index) => {
      const agentId = plan[index] as string;
      if (outcome.status === 'fulfilled') {
        return { agentId, ok: true, output: outcome.value };
      }
      return {
        agentId,
        ok: false,
        output: '',
        error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
      };
    });

    return { candidates };
  }

  async summarize(
    request: OrchestrationModeRequest,
    executeResult: ParallelExecuteResult,
  ): Promise<OrchestrationModeResult> {
    if (this.scorer) {
      const criteria = (request.config?.criteria as string[] | undefined) ?? [];
      const evaluation = await evaluateParallelCandidates(executeResult.candidates, criteria, this.scorer);

      return {
        output: evaluation.winner ? evaluation.winner.output : 'every candidate failed',
        details: { ...executeResult, ...evaluation },
      };
    }

    const succeeded = executeResult.candidates.filter((c) => c.ok);
    const summaryLines = executeResult.candidates.map((c) =>
      c.ok ? `${c.agentId}: ${c.output}` : `${c.agentId}: failed (${c.error})`,
    );

    return {
      output: succeeded.length > 0 ? summaryLines.join('\n') : 'every candidate failed',
      details: executeResult,
    };
  }
}
