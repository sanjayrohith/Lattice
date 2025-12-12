import type Database from 'better-sqlite3';
import { deserializeVector } from './embeddingRepository';

export interface VectorSearchFilter {
  /** Restricts candidates to chunks whose file path starts with this prefix. */
  filePathPrefix?: string;
  /** Restricts candidates to chunks belonging to a `kg_nodes` row of this type. */
  nodeType?: string;
}

export interface VectorSearchResult {
  chunkId: string;
  score: number;
}

interface CandidateRow {
  chunk_id: string;
  vector: Buffer;
}

/** Cosine similarity in [-1, 1]; 0 if either vector has zero magnitude. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity received vectors of differing length (${a.length} vs ${b.length})`);
  }

  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    magnitudeA += x * x;
    magnitudeB += y * y;
  }

  const denominator = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  return denominator === 0 ? 0 : dot / denominator;
}

/**
 * Ranks every embedding for `provider` matching `filter` by cosine
 * similarity to `queryVector` and returns the top `k`. The path/type
 * filter is applied in SQL before any similarity math runs, so a scoped
 * search over a large index only pays the O(n) cosine cost for its
 * candidate subset rather than the whole table.
 */
export function searchByVector(
  db: Database.Database,
  provider: string,
  queryVector: readonly number[],
  k: number,
  filter: VectorSearchFilter = {},
): VectorSearchResult[] {
  const clauses = ['e.provider = @provider'];
  const params: Record<string, unknown> = { provider };

  if (filter.filePathPrefix !== undefined) {
    clauses.push('c.file_path LIKE @filePathPrefix');
    params.filePathPrefix = `${filter.filePathPrefix}%`;
  }
  if (filter.nodeType !== undefined) {
    clauses.push('n.type = @nodeType');
    params.nodeType = filter.nodeType;
  }

  const rows = db
    .prepare(
      `SELECT e.chunk_id AS chunk_id, e.vector AS vector
       FROM kg_embeddings e
       JOIN kg_chunks c ON c.id = e.chunk_id
       LEFT JOIN kg_nodes n ON n.id = c.node_id
       WHERE ${clauses.join(' AND ')}`,
    )
    .all(params) as CandidateRow[];

  const scored = rows.map((row) => ({
    chunkId: row.chunk_id,
    score: cosineSimilarity(queryVector, deserializeVector(row.vector)),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
