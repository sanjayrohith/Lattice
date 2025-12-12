import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

export interface StoredEmbedding {
  id: string;
  chunkId: string;
  provider: string;
  dimension: number;
  vector: number[];
  createdAt: string;
}

interface EmbeddingRow {
  id: string;
  chunk_id: string;
  provider: string;
  dimension: number;
  vector: Buffer;
  created_at: string;
}

/** Packs a vector of 32-bit floats into the little-endian blob stored in `kg_embeddings.vector`. */
export function serializeVector(vector: readonly number[]): Buffer {
  const floats = Float32Array.from(vector);
  return Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength);
}

/** Inverse of {@link serializeVector}. */
export function deserializeVector(blob: Buffer): number[] {
  const floats = new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / Float32Array.BYTES_PER_ELEMENT);
  return Array.from(floats);
}

function fromRow(row: EmbeddingRow): StoredEmbedding {
  return {
    id: row.id,
    chunkId: row.chunk_id,
    provider: row.provider,
    dimension: row.dimension,
    vector: deserializeVector(row.vector),
    createdAt: row.created_at,
  };
}

/**
 * Typed access to `kg_embeddings`. One row per `(chunk, provider)` pair —
 * re-embedding a chunk with the same provider replaces its prior vector
 * rather than accumulating stale duplicates.
 */
export class EmbeddingRepository {
  constructor(private readonly db: Database.Database) {}

  upsert(input: { chunkId: string; provider: string; dimension: number; vector: readonly number[] }): StoredEmbedding {
    const existing = this.findByChunkAndProvider(input.chunkId, input.provider);
    const embedding: StoredEmbedding = {
      id: existing?.id ?? randomUUID(),
      chunkId: input.chunkId,
      provider: input.provider,
      dimension: input.dimension,
      vector: [...input.vector],
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };

    this.db
      .prepare(
        `INSERT INTO kg_embeddings (id, chunk_id, provider, dimension, vector, created_at)
         VALUES (@id, @chunkId, @provider, @dimension, @vector, @createdAt)
         ON CONFLICT (chunk_id, provider) DO UPDATE SET dimension = excluded.dimension, vector = excluded.vector`,
      )
      .run({ ...embedding, vector: serializeVector(embedding.vector) });

    return embedding;
  }

  findByChunkAndProvider(chunkId: string, provider: string): StoredEmbedding | undefined {
    const row = this.db
      .prepare('SELECT * FROM kg_embeddings WHERE chunk_id = ? AND provider = ?')
      .get(chunkId, provider) as EmbeddingRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  listByProvider(provider: string): StoredEmbedding[] {
    const rows = this.db.prepare('SELECT * FROM kg_embeddings WHERE provider = ?').all(provider) as EmbeddingRow[];
    return rows.map(fromRow);
  }
}
