import { describe, expect, it } from 'vitest';
import { findModel, findProvider, listProviders, providerCatalog } from './catalog';

describe('providerCatalog', () => {
  it('declares a unique id for every provider', () => {
    const ids = providerCatalog.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declares at least one model per provider with a positive context window', () => {
    for (const provider of providerCatalog) {
      expect(provider.models.length).toBeGreaterThan(0);
      for (const model of provider.models) {
        expect(model.contextWindow).toBeGreaterThan(0);
        expect(typeof model.supportsTools).toBe('boolean');
        expect(typeof model.supportsStreaming).toBe('boolean');
      }
    }
  });

  it('declares a unique model id within each provider', () => {
    for (const provider of providerCatalog) {
      const ids = provider.models.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('listProviders', () => {
  it('returns the full catalog', () => {
    expect(listProviders()).toBe(providerCatalog);
  });
});

describe('findProvider', () => {
  it('finds a known provider by id', () => {
    expect(findProvider('openai')?.displayName).toBe('OpenAI');
  });

  it('returns undefined for an unknown provider', () => {
    expect(findProvider('does-not-exist')).toBeUndefined();
  });
});

describe('findModel', () => {
  it('finds a known model within its provider', () => {
    expect(findModel('anthropic', 'claude-3-5-sonnet-latest')?.displayName).toBe(
      'Claude 3.5 Sonnet',
    );
  });

  it('returns undefined for a model that exists under a different provider', () => {
    expect(findModel('openai', 'claude-3-5-sonnet-latest')).toBeUndefined();
  });

  it('returns undefined for an unknown provider', () => {
    expect(findModel('does-not-exist', 'gpt-4o')).toBeUndefined();
  });
});
