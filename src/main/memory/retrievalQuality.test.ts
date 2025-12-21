import Database from 'better-sqlite3';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../db/database';
import { migrations } from '../db/migrations';
import { LocalHashingEmbeddingProvider } from './embeddingProvider';
import { hybridSearch } from './hybridSearch';
import { ReindexPipeline } from './reindexPipeline';

const FIXTURE_ROOT = join(__dirname, '__fixtures__', 'retrievalQuality');

/**
 * Labelled query -> expected source file pairs. Each query is worded
 * around the target file's doc comment, so a healthy retrieval pipeline
 * (keyword and/or vector) should surface it within the top `K`.
 */
const LABELLED_QUERIES: ReadonlyArray<{ query: string; expectedFile: string }> = [
  { query: 'authenticate user password', expectedFile: 'authService.ts' },
  { query: 'resolve workspace relative path', expectedFile: 'pathSandboxFixture.ts' },
  { query: 'retry function exponential backoff', expectedFile: 'retryPolicyFixture.ts' },
  { query: 'acquire exclusive file lock', expectedFile: 'lockManagerFixture.ts' },
];

const K = 3;

/** The recorded recall@k floor for this fixture set — a regression is a real drop in retrieval quality, not noise. */
const RECALL_THRESHOLD = 0.75;

describe('retrieval quality regression', () => {
  let db: Database.Database;
  const embeddingProvider = new LocalHashingEmbeddingProvider();

  beforeAll(async () => {
    db = new Database(':memory:');
    runMigrations(db, migrations);
    const pipeline = new ReindexPipeline(db, embeddingProvider);
    await pipeline.runIncrementalPass(FIXTURE_ROOT, {});
  });

  it(`achieves at least ${RECALL_THRESHOLD} recall@${K} over the labelled fixture set`, async () => {
    let hits = 0;

    for (const { query, expectedFile } of LABELLED_QUERIES) {
      const [queryVector] = await embeddingProvider.embed([query]);
      const results = hybridSearch(db, embeddingProvider.id, query, queryVector ?? [], { k: K });

      const chunkIds = results.map((r) => r.id);
      const placeholders = chunkIds.map(() => '?').join(', ');
      const filePaths = chunkIds.length
        ? (db.prepare(`SELECT file_path FROM kg_chunks WHERE id IN (${placeholders})`).all(...chunkIds) as Array<{
            file_path: string;
          }>).map((row) => row.file_path)
        : [];

      if (filePaths.includes(expectedFile)) hits += 1;
    }

    const recall = hits / LABELLED_QUERIES.length;
    expect(recall).toBeGreaterThanOrEqual(RECALL_THRESHOLD);
  });
});
