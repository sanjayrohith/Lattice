import type Database from 'better-sqlite3';

interface EdgeRow {
  source_node_id: string;
  target_node_id: string;
}

interface ChunkNodeRow {
  id: string;
  node_id: string | null;
}

/** The node ids directly connected to `nodeIds` by one edge, in either direction. */
function neighbors(db: Database.Database, nodeIds: readonly string[]): string[] {
  if (nodeIds.length === 0) return [];
  const placeholders = nodeIds.map(() => '?').join(', ');

  const rows = db
    .prepare(
      `SELECT source_node_id, target_node_id FROM kg_edges
       WHERE source_node_id IN (${placeholders}) OR target_node_id IN (${placeholders})`,
    )
    .all(...nodeIds, ...nodeIds) as EdgeRow[];

  const found = new Set<string>();
  for (const row of rows) {
    found.add(row.source_node_id);
    found.add(row.target_node_id);
  }
  return [...found];
}

/**
 * Expands a fused chunk result set by walking `kg_edges` up to `maxHops`
 * from each seed chunk's node — so a chunk matching a call site pulls in
 * the callee's definition, and a definition pulls in its immediate
 * dependents, without the caller having to know which edge relation to
 * follow. Chunks with no `node_id` (unlinked prose) pass through
 * unexpanded. The original seeds are always returned first, in their
 * given order, followed by newly discovered chunks in BFS order.
 */
export function expandChunksViaGraph(
  db: Database.Database,
  seedChunkIds: readonly string[],
  maxHops = 2,
): string[] {
  if (seedChunkIds.length === 0) return [];

  const placeholders = seedChunkIds.map(() => '?').join(', ');
  const seedRows = db
    .prepare(`SELECT id, node_id FROM kg_chunks WHERE id IN (${placeholders})`)
    .all(...seedChunkIds) as ChunkNodeRow[];

  const seedNodeIds = seedRows.map((r) => r.node_id).filter((id): id is string => id !== null);

  const visited = new Set(seedNodeIds);
  let frontier = seedNodeIds;

  for (let hop = 0; hop < maxHops && frontier.length > 0; hop++) {
    const next = neighbors(db, frontier).filter((id) => !visited.has(id));
    next.forEach((id) => visited.add(id));
    frontier = next;
  }

  const discoveredNodeIds = [...visited].filter((id) => !seedNodeIds.includes(id));
  const expandedChunkIds =
    discoveredNodeIds.length === 0
      ? []
      : ((
          db
            .prepare(
              `SELECT id FROM kg_chunks WHERE node_id IN (${discoveredNodeIds.map(() => '?').join(', ')})`,
            )
            .all(...discoveredNodeIds) as Array<{ id: string }>
        ).map((r) => r.id));

  const seen = new Set(seedChunkIds);
  const merged = [...seedChunkIds];
  for (const id of expandedChunkIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return merged;
}
