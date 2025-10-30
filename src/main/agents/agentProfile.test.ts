import { describe, expect, it } from 'vitest';
import { agentBackendRefSchema, agentProfileSchema } from './agentProfile';

describe('agentBackendRefSchema', () => {
  it('accepts an sdk backend with a model config', () => {
    const ref = agentBackendRefSchema.parse({
      kind: 'sdk',
      modelConfig: { providerId: 'openai', modelId: 'gpt-4o' },
    });
    expect(ref.kind).toBe('sdk');
  });

  it('accepts an acp backend referencing a connector id', () => {
    const ref = agentBackendRefSchema.parse({ kind: 'acp', connectorId: 'codex-cli' });
    expect(ref.kind).toBe('acp');
  });

  it('rejects an unknown backend kind', () => {
    expect(() => agentBackendRefSchema.parse({ kind: 'other' })).toThrow();
  });
});

describe('agentProfileSchema', () => {
  it('parses a full sdk-backed profile with defaults applied', () => {
    const profile = agentProfileSchema.parse({
      id: 'agent-1',
      displayName: 'Coder',
      backend: { kind: 'sdk', modelConfig: { providerId: 'openai', modelId: 'gpt-4o' } },
    });

    expect(profile.systemPrompt).toBe('');
    expect(profile.stepBudget).toBe(25);
    expect(profile.role).toBe('worker');
    expect(profile.toolAllowlist).toBeUndefined();
  });

  it('parses a fully specified acp-backed profile', () => {
    const profile = agentProfileSchema.parse({
      id: 'agent-2',
      displayName: 'Reviewer',
      backend: { kind: 'acp', connectorId: 'gemini-cli' },
      systemPrompt: 'Review the diff carefully.',
      toolAllowlist: ['read_file', 'grep_search'],
      stepBudget: 10,
      role: 'reviewer',
    });

    expect(profile.backend).toEqual({ kind: 'acp', connectorId: 'gemini-cli' });
    expect(profile.toolAllowlist).toEqual(['read_file', 'grep_search']);
    expect(profile.role).toBe('reviewer');
  });

  it('rejects a profile missing a display name', () => {
    const result = agentProfileSchema.safeParse({
      id: 'agent-1',
      backend: { kind: 'acp', connectorId: 'x' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive step budget', () => {
    const result = agentProfileSchema.safeParse({
      id: 'agent-1',
      displayName: 'x',
      backend: { kind: 'acp', connectorId: 'x' },
      stepBudget: 0,
    });
    expect(result.success).toBe(false);
  });
});
