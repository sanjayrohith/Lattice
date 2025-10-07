import { describe, expect, it } from 'vitest';
import { agentProfileSchema, modelConfigSchema } from './modelConfig';

describe('modelConfigSchema', () => {
  it('parses a fully specified config', () => {
    const config = modelConfigSchema.parse({
      providerId: 'openai',
      modelId: 'gpt-4o',
      temperature: 0.2,
      maxTokens: 2048,
      systemPrompt: 'You are a helpful assistant.',
    });

    expect(config.providerId).toBe('openai');
    expect(config.temperature).toBe(0.2);
  });

  it('applies defaults for temperature, maxTokens, and systemPrompt', () => {
    const config = modelConfigSchema.parse({ providerId: 'anthropic', modelId: 'claude-3-5-sonnet-latest' });

    expect(config.temperature).toBe(0.7);
    expect(config.maxTokens).toBe(4096);
    expect(config.systemPrompt).toBe('');
  });

  it('rejects an unknown provider id', () => {
    const result = modelConfigSchema.safeParse({ providerId: 'unknown', modelId: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects a temperature outside the valid range', () => {
    const result = modelConfigSchema.safeParse({
      providerId: 'openai',
      modelId: 'gpt-4o',
      temperature: 3,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty model id', () => {
    const result = modelConfigSchema.safeParse({ providerId: 'openai', modelId: '' });
    expect(result.success).toBe(false);
  });
});

describe('agentProfileSchema', () => {
  it('parses a profile referencing a model config', () => {
    const profile = agentProfileSchema.parse({
      id: 'agent-1',
      displayName: 'Coder',
      modelConfig: { providerId: 'openai', modelId: 'gpt-4o' },
    });

    expect(profile.modelConfig.providerId).toBe('openai');
  });

  it('rejects a profile missing a display name', () => {
    const result = agentProfileSchema.safeParse({
      id: 'agent-1',
      modelConfig: { providerId: 'openai', modelId: 'gpt-4o' },
    });
    expect(result.success).toBe(false);
  });
});
