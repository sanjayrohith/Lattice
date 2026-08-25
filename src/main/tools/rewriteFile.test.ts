import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rewriteFileTool } from './rewriteFile';
import { WorkspacePathEscapeError } from './pathSandbox';
import { LockAlreadyHeldError, LockManager } from '../locks/lockManager';
import type { ToolOutcomeRepository } from '../db/repositories/toolOutcomeRepository';

describe('rewriteFileTool', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'lattice-rewrite-file-test-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  function parse(input: Record<string, unknown>) {
    return rewriteFileTool.inputSchema.parse(input);
  }

  it('replaces the entire file when no line range is given', async () => {
    writeFileSync(join(workspaceRoot, 'a.txt'), 'old content');

    await rewriteFileTool.execute(parse({ path: 'a.txt', content: 'brand new content' }), {
      workspaceRoot,
    });

    expect(readFileSync(join(workspaceRoot, 'a.txt'), 'utf-8')).toBe('brand new content');
  });

  it('creates a new file when it does not exist and no line range is given', async () => {
    const result = await rewriteFileTool.execute(parse({ path: 'new.txt', content: 'hello' }), {
      workspaceRoot,
    });

    expect(readFileSync(join(workspaceRoot, 'new.txt'), 'utf-8')).toBe('hello');
    expect(result.path).toBe('new.txt');
  });

  it('replaces only the given line range, preserving lines outside it', async () => {
    writeFileSync(join(workspaceRoot, 'a.txt'), 'one\ntwo\nthree\nfour\nfive');

    await rewriteFileTool.execute(
      parse({ path: 'a.txt', content: 'TWO-REPLACED\nTHREE-REPLACED', startLine: 2, endLine: 3 }),
      { workspaceRoot },
    );

    expect(readFileSync(join(workspaceRoot, 'a.txt'), 'utf-8')).toBe(
      'one\nTWO-REPLACED\nTHREE-REPLACED\nfour\nfive',
    );
  });

  it('replaces a single line when startLine equals endLine', async () => {
    writeFileSync(join(workspaceRoot, 'a.txt'), 'one\ntwo\nthree');

    await rewriteFileTool.execute(
      parse({ path: 'a.txt', content: 'TWO', startLine: 2, endLine: 2 }),
      { workspaceRoot },
    );

    expect(readFileSync(join(workspaceRoot, 'a.txt'), 'utf-8')).toBe('one\nTWO\nthree');
  });

  it('clamps an out-of-range endLine to the last line', async () => {
    writeFileSync(join(workspaceRoot, 'a.txt'), 'one\ntwo\nthree');

    await rewriteFileTool.execute(
      parse({ path: 'a.txt', content: 'REST', startLine: 2, endLine: 100 }),
      { workspaceRoot },
    );

    expect(readFileSync(join(workspaceRoot, 'a.txt'), 'utf-8')).toBe('one\nREST');
  });

  it('rejects a path that escapes the workspace', async () => {
    await expect(
      rewriteFileTool.execute(parse({ path: '../escape.txt', content: 'x' }), { workspaceRoot }),
    ).rejects.toBeInstanceOf(WorkspacePathEscapeError);
  });

  it('requires consent since it modifies workspace content', () => {
    expect(rewriteFileTool.defaultConsent).toBe('ask');
  });

  it('rejects with LockAlreadyHeldError when another owner already holds the lock', async () => {
    const locks = new LockManager();
    locks.acquire(join(workspaceRoot, 'a.txt'), { runId: 'other-run', agentId: 'other-agent' });

    await expect(
      rewriteFileTool.execute(parse({ path: 'a.txt', content: 'x' }), {
        workspaceRoot,
        locks,
        lockOwner: { runId: 'run-1', agentId: 'agent-1' },
      }),
    ).rejects.toBeInstanceOf(LockAlreadyHeldError);
  });

  it('releases the lock after a successful whole-file rewrite', async () => {
    const locks = new LockManager();

    await rewriteFileTool.execute(parse({ path: 'a.txt', content: 'x' }), {
      workspaceRoot,
      locks,
      lockOwner: { runId: 'run-1', agentId: 'agent-1' },
    });

    expect(locks.isLocked(join(workspaceRoot, 'a.txt'))).toBe(false);
  });

  it('records a success outcome for rewrite_file/.txt on a successful rewrite', async () => {
    const toolOutcomes = { record: vi.fn() } as unknown as ToolOutcomeRepository;

    await rewriteFileTool.execute(parse({ path: 'a.txt', content: 'x' }), { workspaceRoot, toolOutcomes });

    expect(toolOutcomes.record).toHaveBeenCalledWith('rewrite_file', '.txt', true);
  });
});
