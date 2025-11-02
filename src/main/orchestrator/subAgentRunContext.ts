import { randomUUID } from 'node:crypto';
import type { AgentProfile } from '../agents/agentProfile';
import type { InternalMessage } from '../ai/messages';
import { AgentRunStateMachine } from '../loop/runStateMachine';
import { StepCapTracker } from '../loop/stepCap';
import type { AnyTool } from '../tools/types';
import type { ToolRegistry } from '../tools/registry';
import type { DelegateToAgentInput } from './delegateToAgentSchema';

/**
 * A subordinate agent's fully isolated run: its own id, its own message
 * history seeded solely from the delegated task (never sharing or
 * inheriting the primary agent's transcript), its own tool allowlist
 * resolved against the shared registry, its own state machine, and its
 * own step budget tracker. Nothing here is shared with the primary
 * run's equivalents, so the subordinate cannot observe or exhaust the
 * primary's state by any means other than the task description and
 * context it was explicitly handed.
 */
export interface SubAgentRunContext {
  runId: string;
  agentProfile: AgentProfile;
  history: InternalMessage[];
  tools: readonly AnyTool[];
  stateMachine: AgentRunStateMachine;
  stepTracker: StepCapTracker;
}

export interface CreateSubAgentRunContextParams {
  agentProfile: AgentProfile;
  delegation: DelegateToAgentInput;
  toolRegistry: ToolRegistry;
  /** Injectable for deterministic tests; defaults to `randomUUID`. */
  runIdFactory?: () => string;
}

function buildInitialHistory(delegation: DelegateToAgentInput): InternalMessage[] {
  const text = delegation.context
    ? `${delegation.task_description}\n\nContext:\n${delegation.context}`
    : delegation.task_description;

  return [{ role: 'user', parts: [{ type: 'text', text }] }];
}

/**
 * Spins up a subordinate agent's run context for a delegated task:
 * seeds its history from the task description and optional context
 * alone, resolves its callable tools from `agentProfile.toolAllowlist`
 * against the shared registry, and gives it a fresh state machine and
 * step budget independent of the primary run that delegated to it.
 */
export function createSubAgentRunContext(params: CreateSubAgentRunContextParams): SubAgentRunContext {
  const runId = (params.runIdFactory ?? randomUUID)();

  return {
    runId,
    agentProfile: params.agentProfile,
    history: buildInitialHistory(params.delegation),
    tools: params.toolRegistry.listForAgent(params.agentProfile.toolAllowlist),
    stateMachine: new AgentRunStateMachine(),
    stepTracker: new StepCapTracker(params.agentProfile.stepBudget),
  };
}
