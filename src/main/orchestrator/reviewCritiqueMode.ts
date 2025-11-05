import type { OrchestrationMode, OrchestrationModeRequest, OrchestrationModeResult } from './orchestrationMode';

export const DEFAULT_REVIEW_CRITIQUE_MAX_ROUNDS = 3;

export interface ReviewCritiquePlan {
  maxRounds: number;
}

export interface ReviewRound {
  round: number;
  producerOutput: string;
  critique: string;
  approved: boolean;
}

export interface ReviewCritiqueExecuteResult {
  rounds: ReviewRound[];
  approved: boolean;
}

/** Produces (or revises, given the previous round's `feedback`) a candidate output. */
export type ProducerRunner = (params: { input: string; feedback?: string }) => Promise<string>;

/** Reviews a producer's output, approving it or returning critique for the next round. */
export type CriticRunner = (params: { producerOutput: string }) => Promise<{ approved: boolean; critique: string }>;

/**
 * The producer/critic duo orchestration mode: one agent produces a
 * candidate, another reviews it, and the loop iterates — feeding the
 * critic's feedback back into the next production round — until the
 * critic approves or `maxRounds` is reached, whichever comes first.
 * Every round is retained in the result, not just the last, so the
 * full back-and-forth is visible regardless of the outcome.
 */
export class ReviewCritiqueMode implements OrchestrationMode<ReviewCritiquePlan, ReviewCritiqueExecuteResult> {
  readonly id = 'review-critique';

  constructor(
    private readonly producer: ProducerRunner,
    private readonly critic: CriticRunner,
  ) {}

  plan(request: OrchestrationModeRequest): ReviewCritiquePlan {
    return { maxRounds: (request.config?.maxRounds as number | undefined) ?? DEFAULT_REVIEW_CRITIQUE_MAX_ROUNDS };
  }

  async execute(
    request: OrchestrationModeRequest,
    plan: ReviewCritiquePlan,
  ): Promise<ReviewCritiqueExecuteResult> {
    const rounds: ReviewRound[] = [];
    let feedback: string | undefined;

    for (let round = 1; round <= plan.maxRounds; round++) {
      const producerOutput = await this.producer({ input: request.taskDescription, feedback });
      const { approved, critique } = await this.critic({ producerOutput });
      rounds.push({ round, producerOutput, critique, approved });

      if (approved) {
        return { rounds, approved: true };
      }
      feedback = critique;
    }

    return { rounds, approved: false };
  }

  summarize(
    _request: OrchestrationModeRequest,
    executeResult: ReviewCritiqueExecuteResult,
  ): OrchestrationModeResult {
    const lastRound = executeResult.rounds.at(-1);

    if (executeResult.approved) {
      return { output: lastRound?.producerOutput ?? '', details: executeResult };
    }

    return {
      output: `not approved after ${executeResult.rounds.length} round(s); last critique: ${
        lastRound?.critique ?? ''
      }`,
      details: executeResult,
    };
  }
}
