import { describe, expect, it, vi } from 'vitest';
import { ConsentGate } from './consentGate';
import { ConsentPolicyStore } from './consentPolicyStore';
import { PendingDecisionRegistry } from '../loop/abortCleanup';
import { AgentRunStateMachine } from '../loop/runStateMachine';

function makeGate() {
  const policyStore = new ConsentPolicyStore();
  const pending = new PendingDecisionRegistry<'accepted' | 'declined'>();
  const stateMachine = new AgentRunStateMachine();
  stateMachine.transition('streaming');
  const notifyPending = vi.fn();
  const gate = new ConsentGate(policyStore, pending, stateMachine, notifyPending);
  return { gate, policyStore, pending, stateMachine, notifyPending };
}

describe('ConsentGate', () => {
  it('declines immediately for never, without suspending the run', async () => {
    const { gate, stateMachine, notifyPending } = makeGate();

    const decision = await gate.requestConsent(
      's1',
      { toolCallId: 'c1', toolName: 'dangerous', input: {} },
      'never',
    );

    expect(decision).toBe('declined');
    expect(stateMachine.current).toBe('streaming');
    expect(notifyPending).not.toHaveBeenCalled();
  });

  it('accepts immediately for always, without suspending the run', async () => {
    const { gate, stateMachine, notifyPending } = makeGate();

    const decision = await gate.requestConsent(
      's1',
      { toolCallId: 'c1', toolName: 'read_file', input: {} },
      'always',
    );

    expect(decision).toBe('accepted');
    expect(stateMachine.current).toBe('streaming');
    expect(notifyPending).not.toHaveBeenCalled();
  });

  it('suspends the run in awaiting-consent for ask, until resolved', async () => {
    const { gate, pending, stateMachine, notifyPending } = makeGate();

    const decisionPromise = gate.requestConsent(
      's1',
      { toolCallId: 'c1', toolName: 'write_file', input: { path: 'a.txt' } },
      'ask',
    );

    // Give the microtask queue a turn so the promise constructor body runs
    // and registers the pending decision before we resolve it.
    await Promise.resolve();

    expect(stateMachine.current).toBe('awaiting-consent');
    expect(notifyPending).toHaveBeenCalledWith({
      toolCallId: 'c1',
      toolName: 'write_file',
      input: { path: 'a.txt' },
    });

    pending.resolve('c1', 'accepted');
    expect(await decisionPromise).toBe('accepted');
    expect(stateMachine.current).toBe('executing-tool');
  });

  it('transitions back to streaming when the user declines', async () => {
    const { gate, pending, stateMachine } = makeGate();

    const decisionPromise = gate.requestConsent(
      's1',
      { toolCallId: 'c1', toolName: 'write_file', input: {} },
      'ask',
    );
    await Promise.resolve();

    pending.resolve('c1', 'declined');
    expect(await decisionPromise).toBe('declined');
    expect(stateMachine.current).toBe('streaming');
  });

  it('honors a session override without ever suspending', async () => {
    const { gate, policyStore, stateMachine, notifyPending } = makeGate();
    policyStore.setSessionOverride('s1', 'write_file', 'always');

    const decision = await gate.requestConsent(
      's1',
      { toolCallId: 'c1', toolName: 'write_file', input: {} },
      'ask',
    );

    expect(decision).toBe('accepted');
    expect(stateMachine.current).toBe('streaming');
    expect(notifyPending).not.toHaveBeenCalled();
  });

  it('is resolvable via abort cleanup declining the pending decision', async () => {
    const { gate, pending } = makeGate();

    const decisionPromise = gate.requestConsent(
      's1',
      { toolCallId: 'c1', toolName: 'write_file', input: {} },
      'ask',
    );
    await Promise.resolve();

    pending.resolveAll('declined');

    expect(await decisionPromise).toBe('declined');
  });
});
