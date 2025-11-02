import { describe, expect, it, vi } from 'vitest';
import { dispatchOrchestrationMode, OrchestrationModeRegistry, type OrchestrationModeRequest } from './orchestrationMode';
import { ChainMode, type ChainStageRunner } from './chainMode';

const baseRequest: OrchestrationModeRequest = {
  modeId: 'chain',
  rootRunId: 'run-1',
  agentIds: ['architect', 'developer', 'devops'],
  taskDescription: 'build the feature',
};

describe('ChainMode.plan', () => {
  it('builds one stage per agent id in order when no stages are configured', () => {
    const mode = new ChainMode(vi.fn());
    expect(mode.plan(baseRequest)).toEqual([
      { agentId: 'architect' },
      { agentId: 'developer' },
      { agentId: 'devops' },
    ]);
  });

  it('uses configured stages with role prompts when provided', () => {
    const mode = new ChainMode(vi.fn());
    const request: OrchestrationModeRequest = {
      ...baseRequest,
      config: { stages: [{ agentId: 'architect', rolePrompt: 'design first' }] },
    };
    expect(mode.plan(request)).toEqual([{ agentId: 'architect', rolePrompt: 'design first' }]);
  });
});

describe('ChainMode.execute', () => {
  it('feeds each stage the previous stage output, starting from the task description', async () => {
    const runStage: ChainStageRunner = vi.fn(async ({ agentId, input }) => `${agentId}-processed(${input})`);
    const mode = new ChainMode(runStage);
    const plan = mode.plan(baseRequest);

    const result = await mode.execute(baseRequest, plan);

    expect(result.stageResults.map((s) => s.output)).toEqual([
      'architect-processed(build the feature)',
      'developer-processed(architect-processed(build the feature))',
      'devops-processed(developer-processed(architect-processed(build the feature)))',
    ]);
    expect(result.stageResults.every((s) => s.ok)).toBe(true);
  });

  it('passes rolePrompt through to the stage runner', async () => {
    const runStage: ChainStageRunner = vi.fn(async () => 'ok');
    const mode = new ChainMode(runStage);
    await mode.execute(baseRequest, [{ agentId: 'architect', rolePrompt: 'be terse' }]);

    expect(runStage).toHaveBeenCalledWith({ agentId: 'architect', input: 'build the feature', rolePrompt: 'be terse' });
  });

  it('halts the chain on a stage failure without running later stages', async () => {
    const runStage: ChainStageRunner = vi
      .fn()
      .mockResolvedValueOnce('ok from architect')
      .mockRejectedValueOnce(new Error('developer crashed'));
    const mode = new ChainMode(runStage);

    const result = await mode.execute(baseRequest, mode.plan(baseRequest));

    expect(result.stageResults).toHaveLength(2);
    expect(result.stageResults[1]).toEqual({ agentId: 'developer', ok: false, output: '', error: 'developer crashed' });
    expect(runStage).toHaveBeenCalledTimes(2);
  });
});

describe('ChainMode.summarize', () => {
  it('reports the final stage output on full success', () => {
    const mode = new ChainMode(vi.fn());
    const result = mode.summarize(baseRequest, {
      stageResults: [
        { agentId: 'architect', ok: true, output: 'plan' },
        { agentId: 'developer', ok: true, output: 'code' },
      ],
    });
    expect(result.output).toBe('code');
  });

  it('reports the failure reason when a stage failed', () => {
    const mode = new ChainMode(vi.fn());
    const result = mode.summarize(baseRequest, {
      stageResults: [
        { agentId: 'architect', ok: true, output: 'plan' },
        { agentId: 'developer', ok: false, output: '', error: 'boom' },
      ],
    });
    expect(result.output).toBe('chain failed at agent "developer": boom');
  });
});

describe('ChainMode via the dispatcher', () => {
  it('runs end to end through dispatchOrchestrationMode', async () => {
    const registry = new OrchestrationModeRegistry();
    registry.register(new ChainMode(async ({ agentId, input }) => `${agentId}:${input}`));

    const result = await dispatchOrchestrationMode(registry, baseRequest);
    expect(result.output).toBe('devops:developer:architect:build the feature');
  });
});
