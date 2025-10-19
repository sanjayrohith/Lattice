import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { openDatabase, runMigrations } from '../database';
import { migrations } from '../migrations';
import { SessionRepository } from './sessionRepository';
import { MessageRepository } from './messageRepository';
import { ToolCallRepository } from './toolCallRepository';

describe('ToolCallRepository', () => {
  let userDataPath: string;
  let db: Database.Database;
  let messages: MessageRepository;
  let toolCalls: ToolCallRepository;
  let messageId: string;

  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'lattice-toolcall-repo-test-'));
    db = openDatabase(userDataPath);
    runMigrations(db, migrations);
    const sessions = new SessionRepository(db);
    messages = new MessageRepository(db);
    toolCalls = new ToolCallRepository(db);
    const sessionId = sessions.create({ title: 'Session' }).id;
    messageId = messages.create({ sessionId, role: 'assistant', content: '' }).id;
  });

  afterEach(() => {
    db.close();
    rmSync(userDataPath, { recursive: true, force: true });
  });

  it('creates a tool call with a null result while pending', () => {
    const record = toolCalls.create({
      messageId,
      toolName: 'read_file',
      arguments: JSON.stringify({ path: 'a.txt' }),
      status: 'pending',
    });

    expect(record.result).toBeNull();
    expect(record.status).toBe('pending');
  });

  it('creates a tool call with a recorded result', () => {
    const record = toolCalls.create({
      messageId,
      toolName: 'read_file',
      arguments: JSON.stringify({ path: 'a.txt' }),
      result: JSON.stringify({ content: 'hi' }),
      status: 'succeeded',
    });

    expect(record.result).toBe(JSON.stringify({ content: 'hi' }));
    expect(record.status).toBe('succeeded');
  });

  it('lists tool calls for a message in chronological order', () => {
    const first = toolCalls.create({
      messageId,
      toolName: 'a',
      arguments: '{}',
      status: 'succeeded',
    });
    const second = toolCalls.create({
      messageId,
      toolName: 'b',
      arguments: '{}',
      status: 'succeeded',
    });

    expect(toolCalls.listByMessage(messageId).map((t) => t.id)).toEqual([first.id, second.id]);
  });

  it('cascades deletion when the owning message is removed', () => {
    toolCalls.create({ messageId, toolName: 'a', arguments: '{}', status: 'succeeded' });

    db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);

    expect(toolCalls.listByMessage(messageId)).toEqual([]);
  });
});
