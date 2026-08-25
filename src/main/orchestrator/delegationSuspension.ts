import type { AgentRunStateMachine } from '../loop/runStateMachine';
import type { ToolCallRequest } from '../loop/toolDispatch';
import { DELEGATE_TO_AGENT_TOOL_NAME } from './delegationTool';
import type { DelegateToAgentInput } from './delegateToAgentSchema';

export interface DelegationCall {
  toolCallId: string;
  input: DelegateToAgentInput;
}

export interface PartitionedToolCalls {
  /** The `delegate_to_agent` call in this turn, if the model made one. */
  delegationCall?: DelegationCall;
  /** Every other tool call in this turn, unaffected by delegation. */
  remainingCalls: ToolCallRequest[];
}

/**
 * Splits a turn's emitted tool calls into at most one `delegate_to_agent`
 * call and everything else. A turn is expected to contain at most one
 * delegation call — the model chose to hand off rather than act — but
 * if a model somehow emits more than one, only the first is treated as
 * the delegation and the rest fall through to `remainingCalls` for
 * ordinary dispatch, since silently dropping a call the model actually
 * made would corrupt the tool-result accounting the rest of the loop
 * relies on.
 */
export function partitionDelegationCall(calls: readonly ToolCallRequest[]): PartitionedToolCalls {
  const index = calls.findIndex((call) => call.toolName === DELEGATE_TO_AGENT_TOOL_NAME);
  if (index === -1) {
    return { remainingCalls: [...calls] };
  }

  const delegationRequest = calls[index] as ToolCallRequest;
  return {
    delegationCall: {
      toolCallId: delegationRequest.toolCallId,
      input: delegationRequest.input as DelegateToAgentInput,
    },
    remainingCalls: calls.filter((_, i) => i !== index),
  };
}

/**
 * Pauses the primary agent's turn by transitioning its state machine
 * into `delegating` — a non-terminal state, per
 * `AgentRunStateMachine`'s legal graph — so the run loop stops
 * requesting further deltas from the primary model stream without
 * ending the run. The loop resumes by transitioning back to
 * `streaming` once the subordinate agent's result has been captured
 * and reinjected.
 */
export function suspendPrimaryForDelegation(stateMachine: AgentRunStateMachine): void {
  stateMachine.transition('delegating');
}
