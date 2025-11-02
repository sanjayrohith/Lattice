import { describe, expect, it, vi } from 'vitest';
import {
  OrchestrationModeRegistry,
  UnknownOrchestrationModeError,
  dispatchOrchestrationMode,
  type OrchestrationMode,
  type OrchestrationModeRequest,
} from './orchestrationMode';

function fakeMode(id: string): OrchestrationMode<{ stages: string[] }, { transcript: string[] }> {
  return {
    id,
    plan: (request) => ({ stages: [...request.agentIds] }),
    execute: (_request, plan) => ({ transcript: plan.stages.map((s) => `ran:${s}`) }),
    summarize: (_request, executeResult) => ({ output: executeResult.transcript.join(', ') }),
  };
}

const baseRequest: OrchestrationModeRequest = {
  modeId: 'fake',
  rootRunId: 'run-1',
  agentIds: ['a', 'b'],
  taskDescription: 'do the thing',
};

describe('OrchestrationModeRegistry', () => {
  it('registers and retrieves a mode by id', () => {
    const registry = new OrchestrationModeRegistry();
    const mode = fakeMode('fake');
    registry.register(mode);

    expect(registry.get('fake')).toBe(mode);
    expect(registry.list()).toEqual([mode]);
  });

  it('returns undefined from get() for an unregistered id', () => {
    const registry = new OrchestrationModeRegistry();
    expect(registry.get('missing')).toBeUndefined();
  });

  it('require() throws UnknownOrchestrationModeError for an unregistered id', () => {
    const registry = new OrchestrationModeRegistry();
    expect(() => registry.require('missing')).toThrow(UnknownOrchestrationModeError);
  });

  it('require() returns the mode when registered', () => {
    const registry = new OrchestrationModeRegistry();
    const mode = fakeMode('fake');
    registry.register(mode);
    expect(registry.require('fake')).toBe(mode);
  });
});

describe('dispatchOrchestrationMode', () => {
  it('drives plan -> execute -> summarize in order and returns the summarized result', async () => {
    const registry = new OrchestrationModeRegistry();
    registry.register(fakeMode('fake'));

    const result = await dispatchOrchestrationMode(registry, baseRequest);
    expect(result).toEqual({ output: 'ran:a, ran:b' });
  });

  it('rejects for an unregistered modeId without calling any hook', async () => {
    const registry = new OrchestrationModeRegistry();
    const plan = vi.fn();
    registry.register({ id: 'other', plan, execute: vi.fn(), summarize: vi.fn() });

    await expect(dispatchOrchestrationMode(registry, baseRequest)).rejects.toBeInstanceOf(
      UnknownOrchestrationModeError,
    );
    expect(plan).not.toHaveBeenCalled();
  });

  it('supports async hooks', async () => {
    const registry = new OrchestrationModeRegistry();
    registry.register({
      id: 'fake',
      plan: async (request) => ({ stages: [...request.agentIds] }),
      execute: async (_request, plan: { stages: string[] }) => ({ transcript: plan.stages }),
      summarize: async (_request, executeResult: { transcript: string[] }) => ({
        output: executeResult.transcript.join('|'),
      }),
    });

    const result = await dispatchOrchestrationMode(registry, baseRequest);
    expect(result).toEqual({ output: 'a|b' });
  });
});
