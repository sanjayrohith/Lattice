import type Database from 'better-sqlite3';
import type { EmbeddingProvider } from './embeddingProvider';
import { expandChunksViaGraph } from './graphExpansion';
import { hybridSearch } from './hybridSearch';

export interface MemoryContextChunk {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
}

interface ChunkRow {
  id: string;
  file_path: string;
  start_line: number;
  end_line: number;
  content: string;
}

/** A rough, provider-agnostic token estimate (~4 characters per token) — cheap enough to run per turn without an actual tokenizer. */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

function formatChunk(chunk: MemoryContextChunk): string {
  return `### ${chunk.filePath}:${chunk.startLine}-${chunk.endLine}\n${chunk.content}`;
}

/**
 * Concatenates ranked chunks into a single context block, most relevant
 * first, stopping as soon as the next chunk would exceed `tokenBudget`
 * rather than truncating a chunk mid-content — a partial function body is
 * worse than one fewer chunk. Returns an empty string when nothing fits.
 */
export function buildMemoryContextBlock(chunks: readonly MemoryContextChunk[], tokenBudget: number): string {
  const parts: string[] = [];
  let used = 0;

  for (const chunk of chunks) {
    const formatted = formatChunk(chunk);
    const cost = estimateTokenCount(formatted);
    if (used + cost > tokenBudget) break;
    parts.push(formatted);
    used += cost;
  }

  return parts.join('\n\n');
}

const MEMORY_CONTEXT_HEADER = 'Relevant workspace context retrieved from memory:';

/** Appends a formatted memory context block under a fixed header, or returns `systemPrompt` unchanged if the block is empty. */
export function injectMemoryContext(
  systemPrompt: string | undefined,
  chunks: readonly MemoryContextChunk[],
  tokenBudget: number,
): string | undefined {
  const block = buildMemoryContextBlock(chunks, tokenBudget);
  if (block.length === 0) return systemPrompt;

  const section = `${MEMORY_CONTEXT_HEADER}\n\n${block}`;
  return systemPrompt ? `${systemPrompt}\n\n${section}` : section;
}

/** Runs hybrid retrieval plus graph expansion for `task` and resolves the matching chunk rows, most relevant first. */
export async function retrieveMemoryContext(
  db: Database.Database,
  embeddingProvider: EmbeddingProvider,
  task: string,
  limit = 10,
): Promise<MemoryContextChunk[]> {
  const [queryVector] = await embeddingProvider.embed([task]);
  const fused = hybridSearch(db, embeddingProvider.id, task, queryVector ?? [], { k: limit });
  const chunkIds = expandChunksViaGraph(
    db,
    fused.map((r) => r.id),
    1,
  );
  if (chunkIds.length === 0) return [];

  const placeholders = chunkIds.map(() => '?').join(', ');
  const rows = db
    .prepare(`SELECT id, file_path, start_line, end_line, content FROM kg_chunks WHERE id IN (${placeholders})`)
    .all(...chunkIds) as ChunkRow[];
  const rowById = new Map(rows.map((row) => [row.id, row]));

  return chunkIds
    .map((id) => rowById.get(id))
    .filter((row): row is ChunkRow => row !== undefined)
    .map((row) => ({ filePath: row.file_path, startLine: row.start_line, endLine: row.end_line, content: row.content }));
}

/**
 * The per-turn entry point: retrieves context relevant to `task` and
 * folds it into `systemPrompt` under `tokenBudget`. Called before
 * {@link invokeAgentModelStream} so retrieval never silently balloons the
 * prompt past what the caller has budgeted for it.
 */
export async function injectRetrievedContext(
  db: Database.Database,
  embeddingProvider: EmbeddingProvider,
  task: string,
  systemPrompt: string | undefined,
  tokenBudget: number,
): Promise<string | undefined> {
  const chunks = await retrieveMemoryContext(db, embeddingProvider, task);
  return injectMemoryContext(systemPrompt, chunks, tokenBudget);
}
