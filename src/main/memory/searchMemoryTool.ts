import type Database from 'better-sqlite3';
import { z } from 'zod';
import { defineTool, type Tool } from '../tools/types';
import type { EmbeddingProvider } from './embeddingProvider';
import { expandChunksViaGraph } from './graphExpansion';
import { hybridSearch } from './hybridSearch';

export const searchMemoryInputSchema = z.object({
  query: z.string().min(1).describe('the natural-language or keyword query to search the workspace memory for'),
  limit: z.number().int().positive().max(50).default(10).describe('the maximum number of chunks to return'),
  filePathPrefix: z
    .string()
    .optional()
    .describe('restrict results to chunks whose file path starts with this prefix'),
  expandGraph: z
    .boolean()
    .default(true)
    .describe('whether to pull in one to two hops of graph-connected chunks (definitions and dependents)'),
});

export type SearchMemoryInput = z.infer<typeof searchMemoryInputSchema>;

export interface SearchMemoryResultChunk {
  chunkId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  score: number | null;
}

export interface SearchMemoryOutput {
  results: SearchMemoryResultChunk[];
}

interface ChunkRow {
  id: string;
  file_path: string;
  start_line: number;
  end_line: number;
  content: string;
}

/**
 * Builds the `search_memory` tool bound to a specific database and
 * embedding provider. A factory rather than a static export because,
 * unlike the filesystem tools, this one needs a live connection to the
 * memory subsystem's storage and a configured embedding backend —
 * dependencies the shared {@link ToolExecutionContext} does not carry.
 * `defaultConsent: 'always'` because it only ever reads indexed content
 * the agent could already reach via `read_file`.
 */
export function createSearchMemoryTool(
  db: Database.Database,
  embeddingProvider: EmbeddingProvider,
): Tool<SearchMemoryInput, SearchMemoryOutput> {
  return defineTool({
    name: 'search_memory',
    description: 'runs hybrid keyword and semantic search over the indexed workspace and returns ranked chunks',
    inputSchema: searchMemoryInputSchema,
    defaultConsent: 'always',
    execute: async (input): Promise<SearchMemoryOutput> => {
      const [queryVector] = await embeddingProvider.embed([input.query]);

      const fused = hybridSearch(db, embeddingProvider.id, input.query, queryVector ?? [], {
        k: input.limit,
        vectorFilter: input.filePathPrefix ? { filePathPrefix: input.filePathPrefix } : undefined,
      });

      const scoreByChunkId = new Map(fused.map((r) => [r.id, r.score]));
      const chunkIds = input.expandGraph
        ? expandChunksViaGraph(
            db,
            fused.map((r) => r.id),
            2,
          )
        : fused.map((r) => r.id);

      if (chunkIds.length === 0) return { results: [] };

      const placeholders = chunkIds.map(() => '?').join(', ');
      const rows = db
        .prepare(`SELECT id, file_path, start_line, end_line, content FROM kg_chunks WHERE id IN (${placeholders})`)
        .all(...chunkIds) as ChunkRow[];
      const rowById = new Map(rows.map((row) => [row.id, row]));

      const results: SearchMemoryResultChunk[] = [];
      for (const chunkId of chunkIds) {
        const row = rowById.get(chunkId);
        if (!row) continue;
        if (input.filePathPrefix && !row.file_path.startsWith(input.filePathPrefix)) continue;
        results.push({
          chunkId: row.id,
          filePath: row.file_path,
          startLine: row.start_line,
          endLine: row.end_line,
          content: row.content,
          score: scoreByChunkId.get(chunkId) ?? null,
        });
      }

      return { results };
    },
  });
}
