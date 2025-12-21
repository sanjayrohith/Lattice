import type Database from 'better-sqlite3';
import type { EmbeddingProvider } from './embeddingProvider';
import { expandChunksViaGraph } from './graphExpansion';
import { hybridSearch } from './hybridSearch';
import type { SeenRangeTracker } from './seenRangeTracker';

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
 * Selects a prefix of `chunks`, most relevant first, stopping as soon as
 * the next chunk would exceed `tokenBudget` rather than truncating a
 * chunk mid-content — a partial function body is worse than one fewer
 * chunk.
 */
export function selectChunksWithinBudget(
  chunks: readonly MemoryContextChunk[],
  tokenBudget: number,
): MemoryContextChunk[] {
  const selected: MemoryContextChunk[] = [];
  let used = 0;

  for (const chunk of chunks) {
    const cost = estimateTokenCount(formatChunk(chunk));
    if (used + cost > tokenBudget) break;
    selected.push(chunk);
    used += cost;
  }

  return selected;
}

/** Formats the budget-selected chunks into a single block; empty string when nothing fits. */
export function buildMemoryContextBlock(chunks: readonly MemoryContextChunk[], tokenBudget: number): string {
  return selectChunksWithinBudget(chunks, tokenBudget).map(formatChunk).join('\n\n');
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

/** Runs hybrid retrieval plus graph expansion for `task`, resolves the matching chunk rows most relevant first, and drops any chunk `seenTracker` already reports as fully covered. */
export async function retrieveMemoryContext(
  db: Database.Database,
  embeddingProvider: EmbeddingProvider,
  task: string,
  limit = 10,
  seenTracker?: SeenRangeTracker,
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

  const chunks = chunkIds
    .map((id) => rowById.get(id))
    .filter((row): row is ChunkRow => row !== undefined)
    .map((row) => ({ filePath: row.file_path, startLine: row.start_line, endLine: row.end_line, content: row.content }));

  if (!seenTracker) return chunks;
  return chunks.filter(
    (chunk) => !seenTracker.isFullyCovered(chunk.filePath, { startLine: chunk.startLine, endLine: chunk.endLine }),
  );
}

/**
 * The per-turn entry point: retrieves context relevant to `task`,
 * excludes anything `seenTracker` already covers, and folds the rest into
 * `systemPrompt` under `tokenBudget` — marking whatever actually made the
 * cut as seen, so the next turn's retrieval skips it too. Called before
 * {@link invokeAgentModelStream} so retrieval never silently balloons the
 * prompt past what the caller has budgeted for it.
 */
export async function injectRetrievedContext(
  db: Database.Database,
  embeddingProvider: EmbeddingProvider,
  task: string,
  systemPrompt: string | undefined,
  tokenBudget: number,
  seenTracker?: SeenRangeTracker,
): Promise<string | undefined> {
  const chunks = await retrieveMemoryContext(db, embeddingProvider, task, 10, seenTracker);
  const selected = selectChunksWithinBudget(chunks, tokenBudget);

  if (seenTracker) {
    for (const chunk of selected) {
      seenTracker.markSeen(chunk.filePath, { startLine: chunk.startLine, endLine: chunk.endLine });
    }
  }

  if (selected.length === 0) return systemPrompt;
  const section = `${MEMORY_CONTEXT_HEADER}\n\n${selected.map(formatChunk).join('\n\n')}`;
  return systemPrompt ? `${systemPrompt}\n\n${section}` : section;
}
