import type Database from 'better-sqlite3';

export interface KeywordSearchResult {
  chunkId: string;
  snippet: string;
  score: number;
}

interface FtsRow {
  id: string;
  snippet: string;
  rank: number;
}

/**
 * Quotes each whitespace-separated token of a raw user query as an FTS5
 * string literal (doubling embedded `"` characters) and joins them with
 * the implicit `AND`. This keeps FTS5 query-syntax operators (`-`, `*`,
 * `NEAR`, column filters, …) in `query` from being interpreted as
 * anything but literal text to match.
 */
export function buildFtsMatchExpression(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => `"${token.replace(/"/g, '""')}"`)
    .join(' ');
}

/**
 * Runs a BM25-ranked keyword search over `kg_chunks_fts` and returns each
 * match's chunk id, a highlighted snippet, and its rank (SQLite's
 * `bm25()` — lower is more relevant). Returns no rows for a blank query
 * rather than matching everything.
 */
export function searchChunksByKeyword(
  db: Database.Database,
  query: string,
  limit = 20,
): KeywordSearchResult[] {
  const matchExpression = buildFtsMatchExpression(query);
  if (matchExpression.length === 0) return [];

  const rows = db
    .prepare(
      `SELECT id AS id,
              snippet(kg_chunks_fts, 1, '<mark>', '</mark>', '…', 12) AS snippet,
              bm25(kg_chunks_fts) AS rank
       FROM kg_chunks_fts
       WHERE kg_chunks_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
    )
    .all(matchExpression, limit) as FtsRow[];

  return rows.map((row) => ({ chunkId: row.id, snippet: row.snippet, score: row.rank }));
}
