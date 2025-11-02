import { describe, expect, it } from 'vitest';
import type { InternalMessage } from '../ai/messages';
import { AgentRunStateMachine } from '../loop/runStateMachine';
import type { DelegationCall } from './delegationSuspension';
import { formatDelegationAsToolResult, resumeAfterDelegation } from './resumeAfterDelegation';

const delegationCall: DelegationCall = {
  toolCallId: 'tc-1',
  input: { target_agent: 'coder', task_description: 'fix it' },
};

describe('formatDelegationAsToolResult', () => {
  it('formats the sub-agent result as a successful tool call result', () => {
    const toolResult = formatDelegationAsToolResult(delegationCall, {
      output: 'fixed the bug',
      filesTouched: ['a.ts'],
    });

    expect(toolResult).toEqual({
      ok: true,
      toolCallId: 'tc-1',
      toolName: 'delegate_to_agent',
      output: { output: 'fixed the bug', filesTouched: ['a.ts'] },
    });
  });
});

describe('resumeAfterDelegation', () => {
  it('appends the result as a tool message and transitions back to streaming', () => {
    const machine = new AgentRunStateMachine();
    machine.transition('streaming');
    machine.transition('delegating');

    const history: InternalMessage[] = [{ role: 'user', parts: [{ type: 'text', text: 'please delegate' }] }];

    const updated = resumeAfterDelegation(machine, history, delegationCall, {
      output: 'fixed the bug',
      filesTouched: ['a.ts'],
    });

    expect(machine.current).toBe('streaming');
    expect(updated).toEqual([
      history[0],
      {
        role: 'tool',
        parts: [
          {
            type: 'tool-result',
            toolCallId: 'tc-1',
            toolName: 'delegate_to_agent',
            output: { output: 'fixed the bug', filesTouched: ['a.ts'] },
            isError: false,
          },
        ],
      },
    ]);
  });

  it('does not mutate the original history array', () => {
    const machine = new AgentRunStateMachine();
    machine.transition('streaming');
    machine.transition('delegating');
    const history: InternalMessage[] = [{ role: 'user', parts: [{ type: 'text', text: 'x' }] }];

    resumeAfterDelegation(machine, history, delegationCall, { output: 'done', filesTouched: [] });

    expect(history).toHaveLength(1);
  });

  it('throws if called from a state other than delegating', () => {
    const machine = new AgentRunStateMachine();
    machine.transition('streaming');

    expect(() =>
      resumeAfterDelegation(machine, [], delegationCall, { output: 'done', filesTouched: [] }),
    ).toThrow();
  });
});
