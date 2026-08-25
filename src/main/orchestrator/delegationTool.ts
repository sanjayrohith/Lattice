import { defineTool, type AnyTool } from '../tools/types';
import { buildDelegateToAgentSchema, type DelegateToAgentInput } from './delegateToAgentSchema';

export const DELEGATE_TO_AGENT_TOOL_NAME = 'delegate_to_agent';

/**
 * Builds the `delegate_to_agent` tool bound to the current roster:
 * calling it hands the task off to `onDelegate`, which the orchestrator
 * wires to the actual suspend/spawn/reinject machinery.
 * This module only owns the tool's shape and its schema's dependency on
 * the live agent id list — not what delegating actually does.
 */
export function createDelegateToAgentTool(
  availableAgentIds: readonly string[],
  onDelegate: (input: DelegateToAgentInput) => Promise<unknown>,
): AnyTool {
  return defineTool({
    name: DELEGATE_TO_AGENT_TOOL_NAME,
    description: 'delegates a task to another available agent and returns its result once complete',
    inputSchema: buildDelegateToAgentSchema(availableAgentIds),
    defaultConsent: 'ask',
    execute: async (input) => onDelegate(input),
  });
}

/**
 * Merges a freshly built `delegate_to_agent` tool into `baseTools`
 * (the orchestrating agent's filesystem, terminal, and any other
 * standing tools) for the upcoming turn. Called every turn rather than
 * once per run, since the set of agents available to delegate to can
 * change between turns (a connector crashes, a profile is deleted).
 * With no agents currently available, the delegation tool is omitted
 * entirely rather than offered with an unsatisfiable schema.
 */
export function buildToolsetWithDelegation(
  baseTools: readonly AnyTool[],
  availableAgentIds: readonly string[],
  onDelegate: (input: DelegateToAgentInput) => Promise<unknown>,
): AnyTool[] {
  if (availableAgentIds.length === 0) {
    return [...baseTools];
  }
  return [...baseTools, createDelegateToAgentTool(availableAgentIds, onDelegate)];
}
