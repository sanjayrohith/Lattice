import type Database from 'better-sqlite3';

export interface EvictStaleChunksOptions {
  /** Chunks last updated before this many days ago are eviction candidates. */
  maxAgeDays?: number;
  /** A candidate chunk is kept anyway once its node has at least this many graph edges. */
  minEdgeCountToKeep?: number;
}

const DEFAULT_MAX_AGE_DAYS = 90;
const DEFAULT_MIN_EDGE_COUNT_TO_KEEP = 1;

interface CandidateRow {
  id: string;
}

/**
 * Evicts chunks that are simultaneously stale (recency: not updated
 * within `maxAgeDays`) and low-relevance (fewer than
 * `minEdgeCountToKeep` graph edges touching their node — an
 * unreferenced symbol or an unlinked prose chunk). A durable
 * agent-authored finding (`kg_nodes.type = 'finding'`) is never evicted
 * regardless of age, and a well-connected symbol survives regardless of
 * age too — only the intersection of old *and* poorly connected is
 * removed. Deleting a chunk cascades to its embeddings via the schema's
 * foreign key. Returns the number of chunks evicted.
 */
export function evictStaleChunks(db: Database.Database, options: EvictStaleChunksOptions = {}): number {
  const maxAgeDays = options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
  const minEdgeCountToKeep = options.minEdgeCountToKeep ?? DEFAULT_MIN_EDGE_COUNT_TO_KEEP;
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();

  const candidates = db
    .prepare(
      `SELECT c.id AS id
       FROM kg_chunks c
       LEFT JOIN kg_nodes n ON n.id = c.node_id
       LEFT JOIN (
         SELECT source_node_id AS node_id FROM kg_edges
         UNION ALL
         SELECT target_node_id AS node_id FROM kg_edges
       ) e ON e.node_id = c.node_id
       WHERE c.updated_at < @cutoff
         AND (n.id IS NULL OR n.type != 'finding')
       GROUP BY c.id
       HAVING COUNT(e.node_id) < @minEdgeCountToKeep`,
    )
    .all({ cutoff, minEdgeCountToKeep }) as CandidateRow[];

  if (candidates.length === 0) return 0;

  const deleteChunk = db.prepare('DELETE FROM kg_chunks WHERE id = ?');
  const evict = db.transaction((ids: readonly string[]) => {
    for (const id of ids) deleteChunk.run(id);
  });
  evict(candidates.map((row) => row.id));

  return candidates.length;
}

/** Reclaims disk space freed by prior deletes. Runs synchronously and briefly locks the database — call between runs, not mid-turn. */
export function vacuumDatabase(db: Database.Database): void {
  db.exec('VACUUM');
}

export interface MaintenanceResult {
  evictedChunks: number;
}

/** The scheduled maintenance entry point: evicts stale/low-relevance chunks, then reclaims the space with `VACUUM`. */
export function runMemoryMaintenance(
  db: Database.Database,
  options: EvictStaleChunksOptions = {},
): MaintenanceResult {
  const evictedChunks = evictStaleChunks(db, options);
  vacuumDatabase(db);
  return { evictedChunks };
}
