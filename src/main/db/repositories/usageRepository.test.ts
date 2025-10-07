import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { openDatabase, runMigrations } from '../database';
import { migrations } from '../migrations';
import { SessionRepository } from './sessionRepository';
import { MessageRepository } from './messageRepository';
import { UsageRepository } from './usageRepository';

describe('UsageRepository', () => {
  let userDataPath: string;
  let db: Database.Database;
  let sessions: SessionRepository;
  let messages: MessageRepository;
  let usage: UsageRepository;
  let sessionId: string;

  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'lattice-usage-repo-test-'));
    db = openDatabase(userDataPath);
    runMigrations(db, migrations);
    sessions = new SessionRepository(db);
    messages = new MessageRepository(db);
    usage = new UsageRepository(db);
    sessionId = sessions.create({ title: 'Session' }).id;
  });

  afterEach(() => {
    db.close();
    rmSync(userDataPath, { recursive: true, force: true });
  });

  it('returns zero totals for a session with no recorded usage', () => {
    expect(usage.sessionTotal(sessionId)).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
  });

  it('aggregates usage recorded across multiple messages in a session', () => {
    const first = messages.create({ sessionId, role: 'assistant', content: 'step one' });
    const second = messages.create({ sessionId, role: 'assistant', content: 'step two' });

    usage.record(sessionId, first.id, { promptTokens: 100, completionTokens: 40, totalTokens: 140 });
    usage.record(sessionId, second.id, { promptTokens: 50, completionTokens: 20, totalTokens: 70 });

    expect(usage.sessionTotal(sessionId)).toEqual({
      promptTokens: 150,
      completionTokens: 60,
      totalTokens: 210,
    });
  });

  it('scopes totals to the given session', () => {
    const otherSessionId = sessions.create({ title: 'Other' }).id;
    const mine = messages.create({ sessionId, role: 'assistant', content: 'mine' });
    const theirs = messages.create({ sessionId: otherSessionId, role: 'assistant', content: 'theirs' });

    usage.record(sessionId, mine.id, { promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    usage.record(otherSessionId, theirs.id, { promptTokens: 1000, completionTokens: 1000, totalTokens: 2000 });

    expect(usage.sessionTotal(sessionId)).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
  });

  it('cascades deletion when the owning session is removed', () => {
    const message = messages.create({ sessionId, role: 'assistant', content: 'gone soon' });
    usage.record(sessionId, message.id, { promptTokens: 10, completionTokens: 5, totalTokens: 15 });

    sessions.delete(sessionId);

    const row = db.prepare('SELECT COUNT(*) AS n FROM usage_records').get() as { n: number };
    expect(row.n).toBe(0);
  });
});
