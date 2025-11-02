import { z } from 'zod';

/** Thrown when a delegation schema is requested with no agents available to delegate to. */
export class NoAvailableAgentsError extends Error {
  constructor() {
    super('cannot build a delegate_to_agent schema with no available agent ids');
    this.name = 'NoAvailableAgentsError';
  }
}

/**
 * Builds the `delegate_to_agent` tool's input schema fresh for each
 * turn, with `target_agent` constrained to exactly the agent ids
 * currently available to delegate to. Built at runtime rather than
 * declared statically because the roster changes as agents are
 * added, removed, or become unavailable (a crashed ACP connector);
 * an agent must never be offered — let alone able to select — a
 * delegation target that cannot actually accept the call right now.
 */
export function buildDelegateToAgentSchema(availableAgentIds: readonly string[]) {
  if (availableAgentIds.length === 0) {
    throw new NoAvailableAgentsError();
  }

  return z.object({
    target_agent: z.enum(availableAgentIds as [string, ...string[]]).describe(
      'the id of the agent to delegate this task to',
    ),
    task_description: z.string().min(1).describe('a clear, self-contained description of the task to delegate'),
    context: z
      .string()
      .optional()
      .describe('any additional context the delegated agent needs beyond the task description'),
  });
}

export type DelegateToAgentInput = {
  target_agent: string;
  task_description: string;
  context?: string;
};
