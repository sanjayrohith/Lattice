import type Database from 'better-sqlite3';
import { searchChunksByKeyword } from './keywordSearch';
import { searchByVector, type VectorSearchFilter } from './vectorSearch';

export interface RankedList {
  /** Ids in rank order, most relevant first. */
  ids: readonly string[];
  /** Multiplies this list's contribution to the fused score; defaults to 1. */
  weight?: number;
}

export interface FusedResult {
  id: string;
  score: number;
}

const DEFAULT_RRF_K = 60;

/**
 * Fuses any number of independently ranked id lists into one ranking via
 * weighted reciprocal rank fusion: each list contributes
 * `weight / (rrfK + rank)` to an id's score, where `rank` is its
 * 1-indexed position in that list (0 if absent from it). Fusing by rank
 * rather than raw score means keyword BM25 and vector cosine similarity —
 * two incomparable scales — combine meaningfully. The result is
 * deduplicated by construction: an id appearing in multiple lists
 * accumulates one summed score rather than one entry per list.
 */
export function fuseRankings(lists: readonly RankedList[], rrfK: number = DEFAULT_RRF_K): FusedResult[] {
  const scores = new Map<string, number>();

  for (const list of lists) {
    const weight = list.weight ?? 1;
    list.ids.forEach((id, index) => {
      const rank = index + 1;
      const contribution = weight / (rrfK + rank);
      scores.set(id, (scores.get(id) ?? 0) + contribution);
    });
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

export interface HybridSearchOptions {
  k?: number;
  rrfK?: number;
  keywordWeight?: number;
  vectorWeight?: number;
  keywordLimit?: number;
  vectorLimit?: number;
  vectorFilter?: VectorSearchFilter;
}

/**
 * Runs FTS5 keyword search and vector cosine search independently and
 * fuses their rankings with {@link fuseRankings}, returning the top `k`
 * chunk ids as a single deduplicated, ranked list.
 */
export function hybridSearch(
  db: Database.Database,
  provider: string,
  query: string,
  queryVector: readonly number[],
  options: HybridSearchOptions = {},
): FusedResult[] {
  const keywordResults = searchChunksByKeyword(db, query, options.keywordLimit ?? 50);
  const vectorResults = searchByVector(
    db,
    provider,
    queryVector,
    options.vectorLimit ?? 50,
    options.vectorFilter ?? {},
  );

  const fused = fuseRankings(
    [
      { ids: keywordResults.map((r) => r.chunkId), weight: options.keywordWeight ?? 1 },
      { ids: vectorResults.map((r) => r.chunkId), weight: options.vectorWeight ?? 1 },
    ],
    options.rrfK,
  );

  return fused.slice(0, options.k ?? 20);
}
