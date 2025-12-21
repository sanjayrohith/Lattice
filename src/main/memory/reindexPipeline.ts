import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { chunkFile } from './chunker';
import type { EmbeddingProvider } from './embeddingProvider';
import { EmbeddingRepository } from './embeddingRepository';
import { extractEntities } from './entityExtractor';
import { indexWorkspace, type FileChange, type FileIndexSnapshot } from './workspaceIndexer';

/** Removes every `kg_nodes` and `kg_chunks` row for `filePath` — cascades to their edges and embeddings via the schema's foreign keys. */
function pruneFile(db: Database.Database, filePath: string): void {
  db.prepare('DELETE FROM kg_nodes WHERE file_path = ?').run(filePath);
  db.prepare('DELETE FROM kg_chunks WHERE file_path = ?').run(filePath);
}

function insertNode(
  db: Database.Database,
  node: { id: string; type: string; name: string; filePath: string | null; startLine: number | null; endLine: number | null },
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO kg_nodes (id, type, name, file_path, start_line, end_line, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).run(node.id, node.type, node.name, node.filePath, node.startLine, node.endLine, now, now);
}

function insertEdge(db: Database.Database, sourceId: string, targetId: string, relation: string): void {
  const now = new Date().toISOString();
  db.prepare('INSERT INTO kg_edges (id, source_node_id, target_node_id, relation, created_at) VALUES (?, ?, ?, ?, ?)').run(
    randomUUID(),
    sourceId,
    targetId,
    relation,
    now,
  );
}

/**
 * Re-chunks, re-extracts, and re-embeds a single file's content from
 * scratch — always preceded by {@link pruneFile}, so a modified file
 * never leaves behind stale chunks or embeddings alongside the new ones.
 */
export class ReindexPipeline {
  private readonly embeddingRepository: EmbeddingRepository;

  constructor(
    private readonly db: Database.Database,
    private readonly embeddingProvider: EmbeddingProvider,
  ) {
    this.embeddingRepository = new EmbeddingRepository(db);
  }

  /** Applies one workspace-indexer change to the knowledge graph and search index. */
  async applyFileChange(workspaceRoot: string, change: FileChange): Promise<void> {
    pruneFile(this.db, change.path);
    if (change.kind === 'deleted') return;

    const content = await readFile(join(workspaceRoot, change.path), 'utf-8');
    const { nodes, edges } = extractEntities(change.path, content);

    for (const node of nodes) insertNode(this.db, node);
    for (const edge of edges) insertEdge(this.db, edge.sourceId, edge.targetId, edge.relation);

    const chunks = chunkFile(change.path, content);
    const chunkRows = chunks.map((chunk) => ({ id: randomUUID(), chunk }));

    const now = new Date().toISOString();
    for (const { id, chunk } of chunkRows) {
      const contentHash = createHash('sha256').update(chunk.content).digest('hex');
      this.db
        .prepare(
          `INSERT INTO kg_chunks (id, node_id, file_path, start_line, end_line, content, content_hash, created_at, updated_at)
           VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(id, chunk.filePath, chunk.startLine, chunk.endLine, chunk.content, contentHash, now, now);
    }

    for (let offset = 0; offset < chunkRows.length; offset += this.embeddingProvider.maxBatchSize) {
      const batch = chunkRows.slice(offset, offset + this.embeddingProvider.maxBatchSize);
      const vectors = await this.embeddingProvider.embed(batch.map((row) => row.chunk.content));
      batch.forEach((row, index) => {
        const vector = vectors[index];
        if (!vector) return;
        this.embeddingRepository.upsert({
          chunkId: row.id,
          provider: this.embeddingProvider.id,
          dimension: this.embeddingProvider.dimension,
          vector,
        });
      });
    }
  }

  /**
   * Diffs `workspaceRoot` against `previousSnapshot` via {@link indexWorkspace}
   * and applies only the resulting added/modified/deleted changes — an
   * unmodified file costs nothing beyond the indexer's stat check.
   */
  async runIncrementalPass(
    workspaceRoot: string,
    previousSnapshot: FileIndexSnapshot,
  ): Promise<{ snapshot: FileIndexSnapshot; changes: readonly FileChange[] }> {
    const { changes, snapshot } = await indexWorkspace(workspaceRoot, previousSnapshot);
    for (const change of changes) {
      await this.applyFileChange(workspaceRoot, change);
    }
    return { snapshot, changes };
  }
}
