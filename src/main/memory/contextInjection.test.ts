import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../db/database';
import { migrations } from '../db/migrations';
import { EmbeddingRepository } from './embeddingRepository';
import { LocalHashingEmbeddingProvider } from './embeddingProvider';
import {
  buildMemoryContextBlock,
  estimateTokenCount,
  injectMemoryContext,
  injectRetrievedContext,
  retrieveMemoryContext,
  type MemoryContextChunk,
} from './contextInjection';

describe('estimateTokenCount', () => {
  it('estimates roughly one token per four characters', () => {
    expect(estimateTokenCount('a'.repeat(40))).toBe(10);
  });
});

describe('buildMemoryContextBlock', () => {
  const chunks: MemoryContextChunk[] = [
    { filePath: 'a.ts', startLine: 1, endLine: 1, content: 'x'.repeat(40) },
    { filePath: 'b.ts', startLine: 1, endLine: 1, content: 'y'.repeat(40) },
  ];

  it('includes chunks in order until the budget is exhausted', () => {
    const block = buildMemoryContextBlock(chunks, 1000);
    expect(block).toContain('a.ts');
    expect(block).toContain('b.ts');
  });

  it('stops before a chunk that would exceed the budget rather than truncating it', () => {
    const tightBudget = estimateTokenCount(`### a.ts:1-1\n${'x'.repeat(40)}`);
    const block = buildMemoryContextBlock(chunks, tightBudget);
    expect(block).toContain('a.ts');
    expect(block).not.toContain('b.ts');
  });

  it('returns an empty string when nothing fits', () => {
    expect(buildMemoryContextBlock(chunks, 0)).toBe('');
  });
});

describe('injectMemoryContext', () => {
  const chunks: MemoryContextChunk[] = [{ filePath: 'a.ts', startLine: 1, endLine: 1, content: 'hello' }];

  it('appends the context block to an existing system prompt', () => {
    const result = injectMemoryContext('You are an agent.', chunks, 1000);
    expect(result).toContain('You are an agent.');
    expect(result).toContain('a.ts');
  });

  it('returns the block alone when there is no prior system prompt', () => {
    const result = injectMemoryContext(undefined, chunks, 1000);
    expect(result).toContain('a.ts');
  });

  it('returns the original system prompt unchanged when the budget admits nothing', () => {
    expect(injectMemoryContext('You are an agent.', chunks, 0)).toBe('You are an agent.');
    expect(injectMemoryContext(undefined, chunks, 0)).toBeUndefined();
  });
});

describe('retrieveMemoryContext / injectRetrievedContext', () => {
  let db: Database.Database;
  const provider = new LocalHashingEmbeddingProvider();

  beforeEach(async () => {
    db = new Database(':memory:');
    runMigrations(db, migrations);

    db.prepare(
      `INSERT INTO kg_chunks (id, node_id, file_path, start_line, end_line, content, content_hash, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, '2026-01-01', '2026-01-01')`,
    ).run('chunk-1', 'src/pathSandbox.ts', 1, 5, 'export function resolveWorkspacePath(root, path) {}', 'hash-1');

    const repo = new EmbeddingRepository(db);
    const [vector] = await provider.embed(['export function resolveWorkspacePath(root, path) {}']);
    repo.upsert({ chunkId: 'chunk-1', provider: provider.id, dimension: provider.dimension, vector: vector! });
  });

  it('retrieves chunks relevant to the task', async () => {
    const chunks = await retrieveMemoryContext(db, provider, 'resolveWorkspacePath');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.filePath).toBe('src/pathSandbox.ts');
  });

  it('folds retrieved context into the system prompt within budget', async () => {
    const result = await injectRetrievedContext(db, provider, 'resolveWorkspacePath', 'base prompt', 1000);
    expect(result).toContain('base prompt');
    expect(result).toContain('src/pathSandbox.ts');
  });

  it('leaves the system prompt untouched when nothing is indexed for the query', async () => {
    const emptyDb = new Database(':memory:');
    runMigrations(emptyDb, migrations);
    const result = await injectRetrievedContext(emptyDb, provider, 'anything', 'base prompt', 1000);
    expect(result).toBe('base prompt');
  });
});
