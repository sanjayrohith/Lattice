import { describe, expect, it } from 'vitest';
import { AgentRunStateMachine, IllegalRunTransitionError, type RunState } from './runStateMachine';

describe('AgentRunStateMachine', () => {
  it('starts idle', () => {
    expect(new AgentRunStateMachine().current).toBe('idle');
  });

  it('walks the happy path from idle to completed', () => {
    const machine = new AgentRunStateMachine();
    machine.transition('streaming');
    machine.transition('completed');

    expect(machine.current).toBe('completed');
    expect(machine.isTerminal()).toBe(true);
  });

  it('walks a tool-call round trip back into streaming', () => {
    const machine = new AgentRunStateMachine();
    machine.transition('streaming');
    machine.transition('executing-tool');
    machine.transition('streaming');

    expect(machine.current).toBe('streaming');
    expect(machine.isTerminal()).toBe(false);
  });

  it('walks an ask-consent round trip through acceptance', () => {
    const machine = new AgentRunStateMachine();
    machine.transition('streaming');
    machine.transition('awaiting-consent');
    machine.transition('executing-tool');
    machine.transition('streaming');

    expect(machine.current).toBe('streaming');
  });

  it('walks an ask-consent round trip through decline back to streaming', () => {
    const machine = new AgentRunStateMachine();
    machine.transition('streaming');
    machine.transition('awaiting-consent');
    machine.transition('streaming');

    expect(machine.current).toBe('streaming');
  });

  it('walks a delegation round trip back into streaming', () => {
    const machine = new AgentRunStateMachine();
    machine.transition('streaming');
    machine.transition('delegating');
    machine.transition('streaming');

    expect(machine.current).toBe('streaming');
    expect(machine.isTerminal()).toBe(false);
  });

  it('rejects delegating directly from idle', () => {
    const machine = new AgentRunStateMachine();
    expect(() => machine.transition('delegating')).toThrow(IllegalRunTransitionError);
  });

  it('rejects skipping idle to run a tool directly', () => {
    const machine = new AgentRunStateMachine();
    expect(() => machine.transition('executing-tool')).toThrow(IllegalRunTransitionError);
  });

  it('rejects transitioning out of a terminal state', () => {
    const machine = new AgentRunStateMachine();
    machine.transition('streaming');
    machine.transition('completed');

    expect(() => machine.transition('streaming')).toThrow(IllegalRunTransitionError);
  });

  it('allows failing from every non-terminal state', () => {
    const nonTerminalPaths: RunState[][] = [
      ['streaming'],
      ['streaming', 'executing-tool'],
      ['streaming', 'awaiting-consent'],
      ['streaming', 'delegating'],
    ];

    for (const path of nonTerminalPaths) {
      const machine = new AgentRunStateMachine();
      for (const state of path) machine.transition(state);
      machine.transition('failed');
      expect(machine.current).toBe('failed');
    }
  });

  it('allows aborting from every non-terminal state', () => {
    const nonTerminalPaths: RunState[][] = [
      ['streaming'],
      ['streaming', 'executing-tool'],
      ['streaming', 'awaiting-consent'],
      ['streaming', 'delegating'],
    ];

    for (const path of nonTerminalPaths) {
      const machine = new AgentRunStateMachine();
      for (const state of path) machine.transition(state);
      machine.transition('aborted');
      expect(machine.current).toBe('aborted');
    }
  });

  it('reports canTransition without mutating state', () => {
    const machine = new AgentRunStateMachine();
    expect(machine.canTransition('streaming')).toBe(true);
    expect(machine.canTransition('completed')).toBe(false);
    expect(machine.current).toBe('idle');
  });

  it('names the offending states on an illegal transition error', () => {
    const machine = new AgentRunStateMachine();
    try {
      machine.transition('completed');
      expect.unreachable('expected transition to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(IllegalRunTransitionError);
      expect((error as IllegalRunTransitionError).from).toBe('idle');
      expect((error as IllegalRunTransitionError).to).toBe('completed');
    }
  });
});
