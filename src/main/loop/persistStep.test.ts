import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { openDatabase, runMigrations } from '../db/database';
import { migrations } from '../db/migrations';
import { SessionRepository } from '../db/repositories/sessionRepository';
import { MessageRepository } from '../db/repositories/messageRepository';
import { ToolCallRepository } from '../db/repositories/toolCallRepository';
import { UsageRepository } from '../db/repositories/usageRepository';
import { persistStep } from './persistStep';
import type { ToolCallRequest, ToolCallResult } from './toolDispatch';

describe('persistStep', () => {
  let userDataPath: string;
  let db: Database.Database;
  let sessions: SessionRepository;
  let messages: MessageRepository;
  let toolCalls: ToolCallRepository;
  let usage: UsageRepository;
  let sessionId: string;

  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'lattice-persist-step-test-'));
    db = openDatabase(userDataPath);
    runMigrations(db, migrations);
    sessions = new SessionRepository(db);
    messages = new MessageRepository(db);
    toolCalls = new ToolCallRepository(db);
    usage = new UsageRepository(db);
    sessionId = sessions.create({ title: 'Session' }).id;
  });

  afterEach(() => {
    db.close();
    rmSync(userDataPath, { recursive: true, force: true });
  });

  function repos() {
    return { messages, toolCalls, usage };
  }

  it('persists the assistant message text', () => {
    persistStep(db, repos(), {
      sessionId,
      assistantText: 'hello from the model',
      toolCalls: [],
      toolResults: [],
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    });

    const stored = messages.listBySession(sessionId);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ role: 'assistant', content: 'hello from the model' });
  });

  it('persists a tool_calls row per emitted call, attached to the assistant message', () => {
    const calls: ToolCallRequest[] = [
      { toolCallId: 'c1', toolName: 'read_file', input: { path: 'a.txt' } },
    ];
    const results: ToolCallResult[] = [
      { ok: true, toolCallId: 'c1', toolName: 'read_file', output: { content: 'hi' } },
    ];

    const persisted = persistStep(db, repos(), {
      sessionId,
      assistantText: '',
      toolCalls: calls,
      toolResults: results,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });

    const stored = toolCalls.listByMessage(persisted.assistantMessageId);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      toolName: 'read_file',
      status: 'succeeded',
      arguments: JSON.stringify({ path: 'a.txt' }),
      result: JSON.stringify({ content: 'hi' }),
    });
  });

  it('records a failed tool call with its error as the result', () => {
    const calls: ToolCallRequest[] = [{ toolCallId: 'c1', toolName: 'boom', input: {} }];
    const results: ToolCallResult[] = [
      { ok: false, toolCallId: 'c1', toolName: 'boom', error: { code: 'X', message: 'bad' } },
    ];

    const persisted = persistStep(db, repos(), {
      sessionId,
      assistantText: '',
      toolCalls: calls,
      toolResults: results,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });

    const stored = toolCalls.listByMessage(persisted.assistantMessageId);
    expect(stored[0]).toMatchObject({
      status: 'failed',
      result: JSON.stringify({ code: 'X', message: 'bad' }),
    });
  });

  it('appends a tool-role message carrying the results, and returns its id', () => {
    const calls: ToolCallRequest[] = [{ toolCallId: 'c1', toolName: 'echo', input: {} }];
    const results: ToolCallResult[] = [
      { ok: true, toolCallId: 'c1', toolName: 'echo', output: 'hi' },
    ];

    const persisted = persistStep(db, repos(), {
      sessionId,
      assistantText: 'calling echo',
      toolCalls: calls,
      toolResults: results,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });

    expect(persisted.toolMessageId).not.toBeNull();
    const stored = messages.listBySession(sessionId);
    expect(stored.map((m) => m.role)).toEqual(['assistant', 'tool']);
  });

  it('omits the tool message and returns null when no tool calls were made', () => {
    const persisted = persistStep(db, repos(), {
      sessionId,
      assistantText: 'no tools needed',
      toolCalls: [],
      toolResults: [],
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });

    expect(persisted.toolMessageId).toBeNull();
    expect(messages.listBySession(sessionId)).toHaveLength(1);
  });

  it('records usage against the assistant message', () => {
    persistStep(db, repos(), {
      sessionId,
      assistantText: 'hi',
      toolCalls: [],
      toolResults: [],
      usage: { promptTokens: 100, completionTokens: 40, totalTokens: 140 },
    });

    expect(usage.sessionTotal(sessionId)).toEqual({
      promptTokens: 100,
      completionTokens: 40,
      totalTokens: 140,
    });
  });

  it('accumulates usage across multiple persisted steps', () => {
    persistStep(db, repos(), {
      sessionId,
      assistantText: 'step 1',
      toolCalls: [],
      toolResults: [],
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    });
    persistStep(db, repos(), {
      sessionId,
      assistantText: 'step 2',
      toolCalls: [],
      toolResults: [],
      usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
    });

    expect(usage.sessionTotal(sessionId)).toEqual({
      promptTokens: 30,
      completionTokens: 15,
      totalTokens: 45,
    });
  });

  it('fully reconstructs a run from a fresh set of repositories against the same database file', () => {
    persistStep(db, repos(), {
      sessionId,
      assistantText: 'first step',
      toolCalls: [{ toolCallId: 'c1', toolName: 'read_file', input: { path: 'a.txt' } }],
      toolResults: [
        { ok: true, toolCallId: 'c1', toolName: 'read_file', output: { content: 'hi' } },
      ],
      usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
    });

    // Simulate a restart: brand new repository instances over the same
    // open connection, standing in for a fresh process reopening the file.
    const reconstructedMessages = new MessageRepository(db);
    const reconstructedToolCalls = new ToolCallRepository(db);
    const reconstructedUsage = new UsageRepository(db);

    const history = reconstructedMessages.listBySession(sessionId);
    expect(history.map((m) => m.role)).toEqual(['assistant', 'tool']);
    expect(reconstructedToolCalls.listByMessage(history[0]?.id ?? '')).toHaveLength(1);
    expect(reconstructedUsage.sessionTotal(sessionId)).toEqual({
      promptTokens: 5,
      completionTokens: 5,
      totalTokens: 10,
    });
  });
});
