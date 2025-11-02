import type { OrchestrationMode, OrchestrationModeRequest, OrchestrationModeResult } from './orchestrationMode';

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
 * (success or failure) once all have settled. Selecting a winner among
 * successful candidates is deliberately out of scope here; see
 * `feat(orchestrator): score and select best parallel result`.
 */
export class ParallelMode implements OrchestrationMode<string[], ParallelExecuteResult> {
  readonly id = 'parallel';

  constructor(private readonly runAgent: ParallelAgentRunner) {}

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

  summarize(_request: OrchestrationModeRequest, executeResult: ParallelExecuteResult): OrchestrationModeResult {
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
