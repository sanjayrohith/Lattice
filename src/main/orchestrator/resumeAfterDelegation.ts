import type { InternalMessage } from '../ai/messages';
import { appendToolResults } from '../loop/reinjectToolResults';
import type { ToolCallResult } from '../loop/toolDispatch';
import type { AgentRunStateMachine } from '../loop/runStateMachine';
import { DELEGATE_TO_AGENT_TOOL_NAME } from './delegationTool';
import type { DelegationCall } from './delegationSuspension';
import type { SubAgentResult } from './subAgentResult';

/**
 * Formats a subordinate agent's normalized result as the same
 * `ToolCallResult` shape any other tool call produces, keyed by the
 * original `delegate_to_agent` call's id — so from the primary model's
 * perspective, delegating was just another tool call that eventually
 * returned an observation, with no special-cased message shape for
 * the model to learn.
 */
export function formatDelegationAsToolResult(
  delegationCall: DelegationCall,
  result: SubAgentResult,
): ToolCallResult {
  return {
    ok: true,
    toolCallId: delegationCall.toolCallId,
    toolName: DELEGATE_TO_AGENT_TOOL_NAME,
    output: { output: result.output, filesTouched: result.filesTouched },
  };
}

/**
 * Resumes the primary agent's suspended stream once a delegation has
 * completed: appends the subordinate's result as a standard tool
 * observation to the primary's history, and transitions its state
 * machine from `delegating` back to `streaming` so the loop requests
 * the model's next step against the updated history.
 */
export function resumeAfterDelegation(
  stateMachine: AgentRunStateMachine,
  history: readonly InternalMessage[],
  delegationCall: DelegationCall,
  result: SubAgentResult,
): InternalMessage[] {
  const updatedHistory = appendToolResults(history, [formatDelegationAsToolResult(delegationCall, result)]);
  stateMachine.transition('streaming');
  return updatedHistory;
}
