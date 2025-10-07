import { describe, expect, it } from 'vitest';
import { createAnthropic, createGoogleGenerativeAI, createOpenAI, generateText, streamText, tool } from './sdk';

describe('ai sdk wiring', () => {
  it('exposes the core generation entry points', () => {
    expect(typeof generateText).toBe('function');
    expect(typeof streamText).toBe('function');
    expect(typeof tool).toBe('function');
  });

  it('exposes a client factory for every configured provider', () => {
    expect(typeof createAnthropic).toBe('function');
    expect(typeof createOpenAI).toBe('function');
    expect(typeof createGoogleGenerativeAI).toBe('function');
  });

  it('constructs a provider client instance given an api key', () => {
    const anthropicClient = createAnthropic({ apiKey: 'sk-test' });
    const openaiClient = createOpenAI({ apiKey: 'sk-test' });
    const googleClient = createGoogleGenerativeAI({ apiKey: 'sk-test' });

    expect(typeof anthropicClient).toBe('function');
    expect(typeof openaiClient).toBe('function');
    expect(typeof googleClient).toBe('function');
  });
});
