import { describe, expect, it, vi } from 'vitest';
import { LocalHashingEmbeddingProvider, RemoteEmbeddingProvider } from './embeddingProvider';

describe('LocalHashingEmbeddingProvider', () => {
  it('produces a unit-length vector of the configured dimension', async () => {
    const provider = new LocalHashingEmbeddingProvider({ dimension: 32 });
    const [vector] = await provider.embed(['hello world']);

    expect(vector).toHaveLength(32);
    const magnitude = Math.sqrt(vector!.reduce((sum, v) => sum + v * v, 0));
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it('is deterministic for the same input', async () => {
    const provider = new LocalHashingEmbeddingProvider();
    const [first] = await provider.embed(['deterministic text']);
    const [second] = await provider.embed(['deterministic text']);
    expect(first).toEqual(second);
  });

  it('produces different vectors for different text', async () => {
    const provider = new LocalHashingEmbeddingProvider();
    const [a] = await provider.embed(['alpha']);
    const [b] = await provider.embed(['completely different content']);
    expect(a).not.toEqual(b);
  });

  it('throws when the batch exceeds maxBatchSize', async () => {
    const provider = new LocalHashingEmbeddingProvider({ maxBatchSize: 1 });
    await expect(provider.embed(['one', 'two'])).rejects.toThrow(/maxBatchSize/);
  });
});

describe('RemoteEmbeddingProvider', () => {
  it('posts the batch and returns parsed embeddings', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }] }),
    });

    const provider = new RemoteEmbeddingProvider({
      id: 'remote',
      dimension: 2,
      maxBatchSize: 8,
      endpoint: 'https://example.test/embeddings',
      apiKey: 'secret-key',
      model: 'test-embed',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.embed(['a', 'b']);

    expect(result).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer secret-key' }),
      }),
    );
  });

  it('throws on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const provider = new RemoteEmbeddingProvider({
      id: 'remote',
      dimension: 2,
      maxBatchSize: 8,
      endpoint: 'https://example.test/embeddings',
      apiKey: 'secret-key',
      model: 'test-embed',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(provider.embed(['a'])).rejects.toThrow(/500/);
  });

  it('returns an empty array without making a request for an empty batch', async () => {
    const fetchImpl = vi.fn();
    const provider = new RemoteEmbeddingProvider({
      id: 'remote',
      dimension: 2,
      maxBatchSize: 8,
      endpoint: 'https://example.test/embeddings',
      apiKey: 'secret-key',
      model: 'test-embed',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(await provider.embed([])).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
