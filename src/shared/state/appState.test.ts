import { describe, expect, it } from 'vitest';
import { appStateSchema, createDefaultAppState } from './appState';

describe('appStateSchema', () => {
  it('parses an empty object into a fully-defaulted app state', () => {
    const state = createDefaultAppState();

    expect(state.agents).toEqual([]);
    expect(state.activeModel).toBeNull();
    expect(state.settings.theme).toBe('system');
    expect(state.settings.stepCap).toBe(25);
    expect(state.runs).toEqual([]);
    expect(state.layout.activeWorkspaceId).toBe('default');
  });

  it('validates a fully populated state', () => {
    const result = appStateSchema.safeParse({
      agents: [{ id: 'a1', displayName: 'Coder', backend: 'sdk', modelId: 'gpt-5' }],
      activeModel: { provider: 'openai', modelId: 'gpt-5' },
      settings: { theme: 'dark', stepCap: 30, defaultAgentId: 'a1', telemetryOptIn: true },
      runs: [{ id: 'r1', agentId: 'a1', status: 'streaming', startedAt: Date.now() }],
      layout: { activeWorkspaceId: 'default', lastSavedAt: Date.now() },
    });

    expect(result.success).toBe(true);
  });

  it('rejects an agent with an unknown backend value', () => {
    const result = appStateSchema.safeParse({
      agents: [{ id: 'a1', displayName: 'Coder', backend: 'not-a-backend' }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects a negative step cap', () => {
    const result = appStateSchema.safeParse({ settings: { stepCap: -1 } });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown run status', () => {
    const result = appStateSchema.safeParse({
      runs: [{ id: 'r1', agentId: 'a1', status: 'not-a-status', startedAt: 0 }],
    });

    expect(result.success).toBe(false);
  });
});
