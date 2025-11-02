import type { OrchestrationMode, OrchestrationModeRequest, OrchestrationModeResult } from './orchestrationMode';

export interface ChainStage {
  agentId: string;
  /** A per-stage system-prompt-style framing, distinct from the agent's own standing system prompt. */
  rolePrompt?: string;
}

export interface ChainStageResult {
  agentId: string;
  ok: boolean;
  output: string;
  error?: string;
}

export interface ChainExecuteResult {
  stageResults: ChainStageResult[];
}

/** Runs one chain stage against `agentId`, returning its text output; rejects on stage failure. */
export type ChainStageRunner = (params: {
  agentId: string;
  input: string;
  rolePrompt?: string;
}) => Promise<string>;

/**
 * The sequential pipeline orchestration mode: each stage's agent
 * receives the previous stage's output as its input (the first stage
 * receives the task description itself), optionally framed by its own
 * `rolePrompt`. A stage that fails halts the chain immediately rather
 * than feeding a failed stage's non-output forward — every later
 * stage is skipped, and the failure is what the mode ultimately
 * reports, since a partial pipeline result presented as if it were
 * complete would be misleading.
 */
export class ChainMode implements OrchestrationMode<ChainStage[], ChainExecuteResult> {
  readonly id = 'chain';

  constructor(private readonly runStage: ChainStageRunner) {}

  plan(request: OrchestrationModeRequest): ChainStage[] {
    const configured = request.config?.stages as ChainStage[] | undefined;
    if (configured && configured.length > 0) return configured;
    return request.agentIds.map((agentId) => ({ agentId }));
  }

  async execute(request: OrchestrationModeRequest, plan: ChainStage[]): Promise<ChainExecuteResult> {
    const stageResults: ChainStageResult[] = [];
    let input = request.taskDescription;

    for (const stage of plan) {
      try {
        const output = await this.runStage({ agentId: stage.agentId, input, rolePrompt: stage.rolePrompt });
        stageResults.push({ agentId: stage.agentId, ok: true, output });
        input = output;
      } catch (error) {
        stageResults.push({
          agentId: stage.agentId,
          ok: false,
          output: '',
          error: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    }

    return { stageResults };
  }

  summarize(_request: OrchestrationModeRequest, executeResult: ChainExecuteResult): OrchestrationModeResult {
    const failedStage = executeResult.stageResults.find((stage) => !stage.ok);
    if (failedStage) {
      return {
        output: `chain failed at agent "${failedStage.agentId}": ${failedStage.error}`,
        details: executeResult,
      };
    }

    const lastStage = executeResult.stageResults.at(-1);
    return { output: lastStage?.output ?? '', details: executeResult };
  }
}
