import { describe, expect, it } from 'vitest';
import { AgentRunStateMachine } from '../loop/runStateMachine';
import type { ToolCallRequest } from '../loop/toolDispatch';
import { partitionDelegationCall, suspendPrimaryForDelegation } from './delegationSuspension';

describe('partitionDelegationCall', () => {
  it('extracts the delegate_to_agent call and leaves other calls untouched', () => {
    const calls: ToolCallRequest[] = [
      { toolCallId: 'tc-1', toolName: 'read_file', input: { path: 'a.txt' } },
      {
        toolCallId: 'tc-2',
        toolName: 'delegate_to_agent',
        input: { target_agent: 'coder', task_description: 'fix it' },
      },
    ];

    const { delegationCall, remainingCalls } = partitionDelegationCall(calls);

    expect(delegationCall).toEqual({
      toolCallId: 'tc-2',
      input: { target_agent: 'coder', task_description: 'fix it' },
    });
    expect(remainingCalls).toEqual([calls[0]]);
  });

  it('returns no delegationCall when the turn has none', () => {
    const calls: ToolCallRequest[] = [{ toolCallId: 'tc-1', toolName: 'read_file', input: {} }];
    const result = partitionDelegationCall(calls);
    expect(result.delegationCall).toBeUndefined();
    expect(result.remainingCalls).toEqual(calls);
  });

  it('treats only the first delegate_to_agent call as the delegation, passing the rest through', () => {
    const calls: ToolCallRequest[] = [
      { toolCallId: 'tc-1', toolName: 'delegate_to_agent', input: { target_agent: 'a', task_description: 'x' } },
      { toolCallId: 'tc-2', toolName: 'delegate_to_agent', input: { target_agent: 'b', task_description: 'y' } },
    ];

    const { delegationCall, remainingCalls } = partitionDelegationCall(calls);
    expect(delegationCall?.toolCallId).toBe('tc-1');
    expect(remainingCalls).toEqual([calls[1]]);
  });

  it('returns an empty remainingCalls array for an empty input', () => {
    expect(partitionDelegationCall([])).toEqual({ remainingCalls: [] });
  });
});

describe('suspendPrimaryForDelegation', () => {
  it('transitions the state machine from streaming to delegating', () => {
    const machine = new AgentRunStateMachine();
    machine.transition('streaming');

    suspendPrimaryForDelegation(machine);

    expect(machine.current).toBe('delegating');
    expect(machine.isTerminal()).toBe(false);
  });

  it('propagates the state machine error for an illegal call from idle', () => {
    const machine = new AgentRunStateMachine();
    expect(() => suspendPrimaryForDelegation(machine)).toThrow();
  });
});
