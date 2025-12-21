import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../db/database';
import { migrations } from '../db/migrations';
import { AgentFindingsRepository } from './agentFindings';
import { LocalHashingEmbeddingProvider } from './embeddingProvider';
import { searchChunksByKeyword } from './keywordSearch';

describe('AgentFindingsRepository', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db, migrations);
  });

  it('records a finding as a node and chunk with its original content preserved', async () => {
    const repo = new AgentFindingsRepository(db);

    const finding = await repo.record({
      kind: 'decision',
      title: 'Use SQLite FTS5 for keyword search',
      content: 'Chosen over a separate search engine to avoid an extra runtime dependency.',
      runId: 'run-1',
      agentId: 'agent-1',
    });

    expect(finding.kind).toBe('decision');
    expect(finding.content).toBe('Chosen over a separate search engine to avoid an extra runtime dependency.');

    const node = db.prepare('SELECT type FROM kg_nodes WHERE id = ?').get(finding.id);
    expect(node).toMatchObject({ type: 'finding' });
  });

  it('is retrievable through keyword search alongside indexed source', async () => {
    const repo = new AgentFindingsRepository(db);
    await repo.record({ kind: 'note', title: 'Retry policy', content: 'Retries respect Retry-After headers.' });

    const results = searchChunksByKeyword(db, 'Retry-After');
    expect(results).toHaveLength(1);
  });

  it('embeds the finding when an embedding provider is configured', async () => {
    const provider = new LocalHashingEmbeddingProvider();
    const repo = new AgentFindingsRepository(db, provider);

    const finding = await repo.record({ kind: 'outcome', title: 'Migration complete', content: 'All rows migrated.' });

    const embedding = db.prepare('SELECT * FROM kg_embeddings WHERE chunk_id = ?').get(finding.chunkId);
    expect(embedding).toBeDefined();
  });

  it('lists findings in creation order, optionally filtered by kind', async () => {
    const repo = new AgentFindingsRepository(db);
    await repo.record({ kind: 'note', title: 'first', content: 'a' });
    await repo.record({ kind: 'decision', title: 'second', content: 'b' });

    expect(repo.list().map((f) => f.title)).toEqual(['first', 'second']);
    expect(repo.list('decision').map((f) => f.title)).toEqual(['second']);
  });
});
