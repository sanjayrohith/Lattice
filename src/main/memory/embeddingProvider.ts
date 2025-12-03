import { createHash } from 'node:crypto';

/**
 * Produces fixed-length vectors for text. `dimension` is the length of
 * every vector a provider returns; `maxBatchSize` is the most texts a
 * single {@link EmbeddingProvider.embed} call may accept — callers must
 * chunk larger batches themselves against it.
 */
export interface EmbeddingProvider {
  readonly id: string;
  readonly dimension: number;
  readonly maxBatchSize: number;
  embed(texts: readonly string[]): Promise<number[][]>;
}

export interface RemoteEmbeddingProviderOptions {
  id: string;
  dimension: number;
  maxBatchSize: number;
  endpoint: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}

interface RemoteEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
}

/** An embedding provider backed by a remote HTTP embeddings API (e.g. an OpenAI-compatible endpoint). */
export class RemoteEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  readonly dimension: number;
  readonly maxBatchSize: number;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RemoteEmbeddingProviderOptions) {
    this.id = options.id;
    this.dimension = options.dimension;
    this.maxBatchSize = options.maxBatchSize;
    this.endpoint = options.endpoint;
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async embed(texts: readonly string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (texts.length > this.maxBatchSize) {
      throw new Error(
        `RemoteEmbeddingProvider received ${texts.length} texts, exceeding maxBatchSize ${this.maxBatchSize}`,
      );
    }

    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });

    if (!response.ok) {
      throw new Error(`RemoteEmbeddingProvider request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as RemoteEmbeddingResponse;
    return payload.data.map((entry) => entry.embedding);
  }
}

export interface LocalHashingEmbeddingProviderOptions {
  id?: string;
  dimension?: number;
  maxBatchSize?: number;
}

/**
 * A dependency-free local embedding provider using the feature-hashing
 * trick: each whitespace token is hashed into one of `dimension` buckets
 * and the resulting vector is L2-normalized. It needs no model download
 * or network access, so it is always available as a fallback, at the
 * cost of the semantic quality a trained embedding model would offer.
 */
export class LocalHashingEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  readonly dimension: number;
  readonly maxBatchSize: number;

  constructor(options: LocalHashingEmbeddingProviderOptions = {}) {
    this.id = options.id ?? 'local-hashing';
    this.dimension = options.dimension ?? 256;
    this.maxBatchSize = options.maxBatchSize ?? 64;
  }

  async embed(texts: readonly string[]): Promise<number[][]> {
    if (texts.length > this.maxBatchSize) {
      throw new Error(
        `LocalHashingEmbeddingProvider received ${texts.length} texts, exceeding maxBatchSize ${this.maxBatchSize}`,
      );
    }
    return Promise.resolve(texts.map((text) => this.embedOne(text)));
  }

  private embedOne(text: string): number[] {
    const vector = new Array<number>(this.dimension).fill(0);
    const tokens = text.toLowerCase().match(/[a-z0-9_]+/g) ?? [];

    for (const token of tokens) {
      const digest = createHash('sha256').update(token).digest();
      const bucket = digest.readUInt32BE(0) % this.dimension;
      const sign = digest.readUInt8(4) % 2 === 0 ? 1 : -1;
      vector[bucket] = (vector[bucket] ?? 0) + sign;
    }

    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (magnitude === 0) return vector;
    return vector.map((value) => value / magnitude);
  }
}
