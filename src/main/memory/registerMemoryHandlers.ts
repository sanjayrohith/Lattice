import type Database from 'better-sqlite3';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { registerHandler } from '../ipc/registerHandler';
import type { EmbeddingProvider } from './embeddingProvider';
import { ReindexPipeline } from './reindexPipeline';
import { createSearchMemoryTool } from './searchMemoryTool';

export interface MemoryHandlerOptions {
  db: Database.Database;
  embeddingProvider: EmbeddingProvider;
  workspaceRoot: string;
}

/**
 * Registers the memory inspector's IPC surface: a manual hybrid search
 * over the indexed workspace (the same retrieval path `search_memory`
 * gives agents, so the panel previews exactly what a run would see), and
 * a full-reindex trigger. A full reindex always passes an empty prior
 * snapshot to {@link ReindexPipeline.runIncrementalPass}, so every
 * existing file is reprocessed regardless of whether it changed — the
 * incremental watcher (`feat(memory): reindex incrementally on
 * filesystem changes`) is what keeps the index cheap turn to turn; this
 * is the explicit, user-initiated escape hatch.
 */
export function registerMemoryHandlers(options: MemoryHandlerOptions): void {
  const searchTool = createSearchMemoryTool(options.db, options.embeddingProvider);
  const pipeline = new ReindexPipeline(options.db, options.embeddingProvider);

  registerHandler(IPC_CHANNELS.MEMORY_SEARCH, async (payload) => {
    const result = await searchTool.execute(
      { query: payload.query, limit: payload.limit ?? 10, expandGraph: true },
      { workspaceRoot: options.workspaceRoot },
    );
    return { results: result.results };
  });

  registerHandler(IPC_CHANNELS.MEMORY_REINDEX, async () => {
    const result = await pipeline.runIncrementalPass(options.workspaceRoot, {});
    return { reindexed: true, changedFiles: result.changes.length };
  });
}
