import { describe, expect, it, vi } from 'vitest';
import type { OrchestrationModeRequest } from './orchestrationMode';
import { SwarmMode, type SwarmTurnRunner } from './swarmMode';

const baseRequest: OrchestrationModeRequest = {
  modeId: 'swarm',
  rootRunId: 'run-1',
  agentIds: ['project-manager', 'architect', 'developer', 'devops'],
  taskDescription: 'ship the feature',
};

describe('SwarmMode.plan', () => {
  it('preserves the agent id order as the turn order', () => {
    const mode = new SwarmMode(vi.fn());
    expect(mode.plan(baseRequest)).toEqual(['project-manager', 'architect', 'developer', 'devops']);
  });
});

describe('SwarmMode.execute', () => {
  it('cycles through agents round-robin up to the configured maxTurns', async () => {
    const runTurn: SwarmTurnRunner = vi.fn(async ({ agentId }) => `${agentId}-said-something`);
    const mode = new SwarmMode(runTurn);

    const result = await mode.execute({ ...baseRequest, config: { maxTurns: 6 } }, mode.plan(baseRequest));

    expect(result.turns.map((t) => t.agentId)).toEqual([
      'project-manager',
      'architect',
      'developer',
      'devops',
      'project-manager',
      'architect',
    ]);
    expect(result.turns.map((t) => t.turnIndex)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('passes the accumulated transcript so far into each turn', async () => {
    const seenTranscriptLengths: number[] = [];
    const runTurn: SwarmTurnRunner = vi.fn(async ({ transcript }) => {
      seenTranscriptLengths.push(transcript.length);
      return 'msg';
    });
    const mode = new SwarmMode(runTurn);

    await mode.execute({ ...baseRequest, config: { maxTurns: 3 } }, mode.plan(baseRequest));

    expect(seenTranscriptLengths).toEqual([0, 1, 2]);
  });

  it('uses the constructor default max turns when unconfigured', async () => {
    const runTurn: SwarmTurnRunner = vi.fn(async () => 'msg');
    const mode = new SwarmMode(runTurn, 2);

    const result = await mode.execute(baseRequest, mode.plan(baseRequest));
    expect(result.turns).toHaveLength(2);
  });

  it('produces no turns for an empty agent list', async () => {
    const mode = new SwarmMode(vi.fn());
    const result = await mode.execute({ ...baseRequest, agentIds: [] }, []);
    expect(result.turns).toEqual([]);
  });
});

describe('SwarmMode.summarize', () => {
  it('reports the last turn message as the output', () => {
    const mode = new SwarmMode(vi.fn());
    const result = mode.summarize(baseRequest, {
      turns: [
        { turnIndex: 0, agentId: 'project-manager', message: 'kickoff' },
        { turnIndex: 1, agentId: 'architect', message: 'design done' },
      ],
    });
    expect(result.output).toBe('design done');
  });

  it('reports an empty string with no turns', () => {
    const mode = new SwarmMode(vi.fn());
    expect(mode.summarize(baseRequest, { turns: [] }).output).toBe('');
  });
});
