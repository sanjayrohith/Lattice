import type { OrchestrationMode, OrchestrationModeRequest, OrchestrationModeResult } from './orchestrationMode';

export const DEFAULT_SWARM_MAX_TURNS = 12;

export interface SwarmTurn {
  turnIndex: number;
  agentId: string;
  message: string;
}

export interface SwarmExecuteResult {
  turns: SwarmTurn[];
}

/** Produces one agent's contribution to the shared transcript for its turn. */
export type SwarmTurnRunner = (params: {
  agentId: string;
  transcript: readonly SwarmTurn[];
  taskDescription: string;
}) => Promise<string>;

/**
 * The agentic team swarm orchestration mode: role-based agents (project
 * manager, architect, developer, devops, ...) take turns in round-robin
 * order over `agentIds`, each contributing to one shared transcript
 * every other agent's turn can see in full — unlike the chain mode,
 * where only the immediately preceding stage's output is passed
 * forward. Turn order is fixed by `agentIds`'s order in the request;
 * assigning specific roles to specific positions is the caller's
 * concern when building that list, not this mode's.
 */
export class SwarmMode implements OrchestrationMode<string[], SwarmExecuteResult> {
  readonly id = 'swarm';

  constructor(
    private readonly runTurn: SwarmTurnRunner,
    private readonly defaultMaxTurns: number = DEFAULT_SWARM_MAX_TURNS,
  ) {}

  plan(request: OrchestrationModeRequest): string[] {
    return [...request.agentIds];
  }

  async execute(request: OrchestrationModeRequest, plan: string[]): Promise<SwarmExecuteResult> {
    if (plan.length === 0) {
      return { turns: [] };
    }

    const maxTurns = (request.config?.maxTurns as number | undefined) ?? this.defaultMaxTurns;
    const turns: SwarmTurn[] = [];

    for (let turnIndex = 0; turnIndex < maxTurns; turnIndex++) {
      const agentId = plan[turnIndex % plan.length] as string;
      const message = await this.runTurn({
        agentId,
        transcript: turns,
        taskDescription: request.taskDescription,
      });
      turns.push({ turnIndex, agentId, message });
    }

    return { turns };
  }

  summarize(_request: OrchestrationModeRequest, executeResult: SwarmExecuteResult): OrchestrationModeResult {
    const lastTurn = executeResult.turns.at(-1);
    return { output: lastTurn?.message ?? '', details: executeResult };
  }
}
