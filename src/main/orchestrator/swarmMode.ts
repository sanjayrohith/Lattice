import type { OrchestrationMode, OrchestrationModeRequest, OrchestrationModeResult } from './orchestrationMode';
import { detectSwarmTermination, type ConsensusDetector, type SwarmTerminationReason } from './swarmTermination';

export const DEFAULT_SWARM_MAX_TURNS = 12;

export interface SwarmTurn {
  turnIndex: number;
  agentId: string;
  message: string;
}

export interface SwarmExecuteResult {
  turns: SwarmTurn[];
  terminationReason: SwarmTerminationReason;
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
 *
 * Termination is never left to run away: after every turn,
 * {@link detectSwarmTermination} checks for consensus (via an
 * optional `consensusDetector`), the round cap, and a stalled,
 * repeating conversation, in that priority order — guaranteeing the
 * swarm always ends with a definite, recorded reason rather than
 * running indefinitely.
 */
export class SwarmMode implements OrchestrationMode<string[], SwarmExecuteResult> {
  readonly id = 'swarm';

  constructor(
    private readonly runTurn: SwarmTurnRunner,
    private readonly defaultMaxTurns: number = DEFAULT_SWARM_MAX_TURNS,
    private readonly consensusDetector?: ConsensusDetector,
  ) {}

  plan(request: OrchestrationModeRequest): string[] {
    return [...request.agentIds];
  }

  async execute(request: OrchestrationModeRequest, plan: string[]): Promise<SwarmExecuteResult> {
    const maxTurns = (request.config?.maxTurns as number | undefined) ?? this.defaultMaxTurns;
    const stallWindow = request.config?.stallWindow as number | undefined;

    if (plan.length === 0) {
      return { turns: [], terminationReason: 'round-cap' };
    }

    const turns: SwarmTurn[] = [];

    while (true) {
      const turnIndex = turns.length;
      const agentId = plan[turnIndex % plan.length] as string;
      const message = await this.runTurn({
        agentId,
        transcript: turns,
        taskDescription: request.taskDescription,
      });
      turns.push({ turnIndex, agentId, message });

      const terminationReason = detectSwarmTermination(turns, {
        maxTurns,
        consensusDetector: this.consensusDetector,
        stallWindow,
      });

      if (terminationReason) {
        return { turns, terminationReason };
      }
    }
  }

  summarize(_request: OrchestrationModeRequest, executeResult: SwarmExecuteResult): OrchestrationModeResult {
    const lastTurn = executeResult.turns.at(-1);
    return { output: lastTurn?.message ?? '', details: executeResult };
  }
}
