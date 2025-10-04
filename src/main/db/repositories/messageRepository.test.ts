import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { openDatabase, runMigrations } from '../database';
import { migrations } from '../migrations';
import { SessionRepository } from './sessionRepository';
import { MessageRepository } from './messageRepository';

describe('MessageRepository', () => {
  let userDataPath: string;
  let db: Database.Database;
  let sessions: SessionRepository;
  let messages: MessageRepository;
  let sessionId: string;

  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'lattice-message-repo-test-'));
    db = openDatabase(userDataPath);
    runMigrations(db, migrations);
    sessions = new SessionRepository(db);
    messages = new MessageRepository(db);
    sessionId = sessions.create({ title: 'Session' }).id;
  });

  afterEach(() => {
    db.close();
    rmSync(userDataPath, { recursive: true, force: true });
  });

  it('creates and finds a message by id', () => {
    const created = messages.create({ sessionId, role: 'user', content: 'hello' });

    expect(messages.findById(created.id)).toEqual(created);
  });

  it('lists messages for a session in chronological order', () => {
    const first = messages.create({ sessionId, role: 'user', content: 'first' });
    const second = messages.create({ sessionId, role: 'assistant', content: 'second' });

    expect(messages.listBySession(sessionId).map((m) => m.id)).toEqual([first.id, second.id]);
  });

  it('scopes listBySession to the given session', () => {
    const otherSessionId = sessions.create({ title: 'Other' }).id;
    messages.create({ sessionId, role: 'user', content: 'mine' });
    messages.create({ sessionId: otherSessionId, role: 'user', content: 'theirs' });

    expect(messages.listBySession(sessionId)).toHaveLength(1);
  });

  it('updates message content', () => {
    const created = messages.create({ sessionId, role: 'user', content: 'draft' });
    const updated = messages.update(created.id, { content: 'final' });

    expect(updated?.content).toBe('final');
  });

  it('cascades deletion when the owning session is removed', () => {
    const created = messages.create({ sessionId, role: 'user', content: 'gone soon' });
    sessions.delete(sessionId);

    expect(messages.findById(created.id)).toBeUndefined();
  });
});
