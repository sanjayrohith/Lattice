import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { dispatchToolCallsWithConsent, dispatchToolCallWithConsent } from './dispatchWithConsent';
import { ConsentGate } from './consentGate';
import { ConsentPolicyStore } from './consentPolicyStore';
import { PendingDecisionRegistry } from '../loop/abortCleanup';
import { AgentRunStateMachine } from '../loop/runStateMachine';
import { ToolRegistry } from '../tools/registry';
import { defineTool } from '../tools/types';
import { TOOL_DECLINED_CODE } from './toolDeclinedResult';

const context = { workspaceRoot: '/tmp/workspace' };

function makeRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(
    defineTool({
      name: 'read_file',
      description: 'always-consent read',
      inputSchema: z.object({ path: z.string() }),
      defaultConsent: 'always',
      execute: async (input) => ({ path: input.path }),
    }),
  );
  registry.register(
    defineTool({
      name: 'write_file',
      description: 'ask-consent write',
      inputSchema: z.object({ path: z.string() }),
      defaultConsent: 'ask',
      execute: async (input) => ({ written: input.path }),
    }),
  );
  return registry;
}

function makeGate() {
  const policyStore = new ConsentPolicyStore();
  const pending = new PendingDecisionRegistry<'accepted' | 'declined'>();
  const stateMachine = new AgentRunStateMachine();
  stateMachine.transition('streaming');
  const notifyPending = vi.fn();
  const gate = new ConsentGate(policyStore, pending, stateMachine, notifyPending);
  return { gate, policyStore, pending, stateMachine };
}

describe('dispatchToolCallWithConsent', () => {
  it('dispatches immediately for an always-consent tool', async () => {
    const { gate } = makeGate();
    const result = await dispatchToolCallWithConsent(
      { toolCallId: 'c1', toolName: 'read_file', input: { path: 'a.txt' } },
      makeRegistry(),
      context,
      gate,
      's1',
    );

    expect(result).toEqual({ ok: true, toolCallId: 'c1', toolName: 'read_file', output: { path: 'a.txt' } });
  });

  it('returns UNKNOWN_TOOL without ever consulting the consent gate', async () => {
    const { gate } = makeGate();
    const notifyPendingSpy = vi.spyOn(gate, 'requestConsent');

    const result = await dispatchToolCallWithConsent(
      { toolCallId: 'c1', toolName: 'does_not_exist', input: {} },
      makeRegistry(),
      context,
      gate,
      's1',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('UNKNOWN_TOOL');
    expect(notifyPendingSpy).not.toHaveBeenCalled();
  });

  it('suspends for an ask-consent tool and dispatches once accepted', async () => {
    const { gate, pending } = makeGate();

    const resultPromise = dispatchToolCallWithConsent(
      { toolCallId: 'c1', toolName: 'write_file', input: { path: 'a.txt' } },
      makeRegistry(),
      context,
      gate,
      's1',
    );
    await Promise.resolve();
    pending.resolve('c1', 'accepted');

    const result = await resultPromise;
    expect(result).toEqual({
      ok: true,
      toolCallId: 'c1',
      toolName: 'write_file',
      output: { written: 'a.txt' },
    });
  });

  it('returns a TOOL_DECLINED failure without ever calling execute, when declined', async () => {
    const { gate, pending } = makeGate();
    const registry = makeRegistry();
    const executeSpy = vi.spyOn(registry.get('write_file')!, 'execute');

    const resultPromise = dispatchToolCallWithConsent(
      { toolCallId: 'c1', toolName: 'write_file', input: { path: 'a.txt' } },
      registry,
      context,
      gate,
      's1',
    );
    await Promise.resolve();
    pending.resolve('c1', 'declined');

    const result = await resultPromise;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(TOOL_DECLINED_CODE);
    expect(executeSpy).not.toHaveBeenCalled();
  });
});

describe('dispatchToolCallsWithConsent', () => {
  it('dispatches every call in order, gating each independently', async () => {
    const { gate } = makeGate();

    const results = await dispatchToolCallsWithConsent(
      [
        { toolCallId: 'c1', toolName: 'read_file', input: { path: 'a.txt' } },
        { toolCallId: 'c2', toolName: 'read_file', input: { path: 'b.txt' } },
      ],
      makeRegistry(),
      context,
      gate,
      's1',
    );

    expect(results.map((r) => r.toolCallId)).toEqual(['c1', 'c2']);
    expect(results.every((r) => r.ok)).toBe(true);
  });
});
