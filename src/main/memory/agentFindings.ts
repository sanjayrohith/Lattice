import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { EmbeddingProvider } from './embeddingProvider';
import { EmbeddingRepository } from './embeddingRepository';

export type FindingKind = 'note' | 'decision' | 'outcome';

export interface RecordFindingInput {
  kind: FindingKind;
  title: string;
  content: string;
  runId?: string;
  agentId?: string;
}

export interface AgentFinding {
  id: string;
  chunkId: string;
  kind: FindingKind;
  title: string;
  content: string;
  runId: string | null;
  agentId: string | null;
  createdAt: string;
}

interface FindingRow {
  node_id: string;
  chunk_id: string;
  name: string;
  metadata: string;
  content: string;
  created_at: string;
}

function findingChunkFilePath(nodeId: string): string {
  return `memory://finding/${nodeId}`;
}

function toFinding(row: FindingRow): AgentFinding {
  const metadata = JSON.parse(row.metadata) as { kind: FindingKind; runId: string | null; agentId: string | null };
  const prefix = `${row.name}\n\n`;
  const content = row.content.startsWith(prefix) ? row.content.slice(prefix.length) : row.content;

  return {
    id: row.node_id,
    chunkId: row.chunk_id,
    kind: metadata.kind,
    title: row.name,
    content,
    runId: metadata.runId,
    agentId: metadata.agentId,
    createdAt: row.created_at,
  };
}

/**
 * Persists agent-authored notes, decisions, and task outcomes as
 * first-class `kg_nodes` (type `finding`) with a paired `kg_chunks` row
 * so they flow through the same FTS5/vector/hybrid retrieval path as
 * indexed source — a later session's `search_memory` call can surface a
 * past decision exactly like it would a function definition. Durability
 * comes for free: both tables live in the same on-disk SQLite database
 * every other part of the memory subsystem persists to.
 */
export class AgentFindingsRepository {
  private readonly embeddingRepository: EmbeddingRepository;

  constructor(
    private readonly db: Database.Database,
    private readonly embeddingProvider?: EmbeddingProvider,
  ) {
    this.embeddingRepository = new EmbeddingRepository(db);
  }

  async record(input: RecordFindingInput): Promise<AgentFinding> {
    const now = new Date().toISOString();
    const nodeId = randomUUID();
    const chunkId = randomUUID();
    const metadata = JSON.stringify({ kind: input.kind, runId: input.runId ?? null, agentId: input.agentId ?? null });

    this.db
      .prepare(
        `INSERT INTO kg_nodes (id, type, name, file_path, start_line, end_line, metadata, created_at, updated_at)
         VALUES (?, 'finding', ?, NULL, NULL, NULL, ?, ?, ?)`,
      )
      .run(nodeId, input.title, metadata, now, now);

    const chunkContent = `${input.title}\n\n${input.content}`;
    const filePath = findingChunkFilePath(nodeId);
    const contentHash = createHash('sha256').update(chunkContent).digest('hex');

    this.db
      .prepare(
        `INSERT INTO kg_chunks (id, node_id, file_path, start_line, end_line, content, content_hash, created_at, updated_at)
         VALUES (?, ?, ?, 1, 1, ?, ?, ?, ?)`,
      )
      .run(chunkId, nodeId, filePath, chunkContent, contentHash, now, now);

    if (this.embeddingProvider) {
      const [vector] = await this.embeddingProvider.embed([chunkContent]);
      if (vector) {
        this.embeddingRepository.upsert({
          chunkId,
          provider: this.embeddingProvider.id,
          dimension: this.embeddingProvider.dimension,
          vector,
        });
      }
    }

    return {
      id: nodeId,
      chunkId,
      kind: input.kind,
      title: input.title,
      content: input.content,
      runId: input.runId ?? null,
      agentId: input.agentId ?? null,
      createdAt: now,
    };
  }

  list(kind?: FindingKind): AgentFinding[] {
    const rows = this.db
      .prepare(
        `SELECT n.id AS node_id, c.id AS chunk_id, n.name AS name, n.metadata AS metadata, c.content AS content, n.created_at AS created_at
         FROM kg_nodes n
         JOIN kg_chunks c ON c.node_id = n.id
         WHERE n.type = 'finding'
         ORDER BY n.created_at ASC`,
      )
      .all() as FindingRow[];

    const findings = rows.map(toFinding);
    return kind ? findings.filter((finding) => finding.kind === kind) : findings;
  }
}
