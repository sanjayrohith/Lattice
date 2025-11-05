import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { editFileTool, SearchReplaceMismatchError } from './editFile';
import { WorkspacePathEscapeError } from './pathSandbox';
import { LockAlreadyHeldError, LockManager } from '../locks/lockManager';

describe('editFileTool', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'lattice-edit-file-test-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  function parse(input: Record<string, unknown>) {
    return editFileTool.inputSchema.parse(input);
  }

  it('replaces the single matching occurrence', async () => {
    writeFileSync(join(workspaceRoot, 'a.txt'), 'const x = 1;\nconst y = 2;');

    const result = await editFileTool.execute(
      parse({ path: 'a.txt', search: 'const x = 1;', replace: 'const x = 100;' }),
      { workspaceRoot },
    );

    expect(readFileSync(join(workspaceRoot, 'a.txt'), 'utf-8')).toBe('const x = 100;\nconst y = 2;');
    expect(result.path).toBe('a.txt');
  });

  it('throws a descriptive error naming the file when the search text is not found', async () => {
    writeFileSync(join(workspaceRoot, 'a.txt'), 'const x = 1;');

    await expect(
      editFileTool.execute(parse({ path: 'a.txt', search: 'const z = 9;', replace: 'x' }), {
        workspaceRoot,
      }),
    ).rejects.toThrow(SearchReplaceMismatchError);

    try {
      await editFileTool.execute(parse({ path: 'a.txt', search: 'const z = 9;', replace: 'x' }), {
        workspaceRoot,
      });
      expect.unreachable('expected a rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(SearchReplaceMismatchError);
      expect((error as SearchReplaceMismatchError).occurrences).toBe(0);
      expect((error as SearchReplaceMismatchError).message).toContain('a.txt');
      expect((error as SearchReplaceMismatchError).message).toContain('not found');
    }
  });

  it('throws a descriptive error naming the ambiguity when the search text matches more than once', async () => {
    writeFileSync(join(workspaceRoot, 'a.txt'), 'foo\nfoo\nfoo');

    try {
      await editFileTool.execute(parse({ path: 'a.txt', search: 'foo', replace: 'bar' }), {
        workspaceRoot,
      });
      expect.unreachable('expected a rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(SearchReplaceMismatchError);
      expect((error as SearchReplaceMismatchError).occurrences).toBe(3);
      expect((error as SearchReplaceMismatchError).message).toContain('3 locations');
    }
  });

  it('leaves the file unchanged when the edit is rejected as ambiguous', async () => {
    writeFileSync(join(workspaceRoot, 'a.txt'), 'foo\nfoo');

    await expect(
      editFileTool.execute(parse({ path: 'a.txt', search: 'foo', replace: 'bar' }), { workspaceRoot }),
    ).rejects.toThrow();

    expect(readFileSync(join(workspaceRoot, 'a.txt'), 'utf-8')).toBe('foo\nfoo');
  });

  it('rejects a path that escapes the workspace', async () => {
    await expect(
      editFileTool.execute(parse({ path: '../escape.txt', search: 'a', replace: 'b' }), {
        workspaceRoot,
      }),
    ).rejects.toBeInstanceOf(WorkspacePathEscapeError);
  });

  it('requires consent since it modifies workspace content', () => {
    expect(editFileTool.defaultConsent).toBe('ask');
  });

  it('rejects with LockAlreadyHeldError when another owner already holds the lock', async () => {
    writeFileSync(join(workspaceRoot, 'a.txt'), 'const x = 1;');
    const locks = new LockManager();
    locks.acquire(join(workspaceRoot, 'a.txt'), { runId: 'other-run', agentId: 'other-agent' });

    await expect(
      editFileTool.execute(parse({ path: 'a.txt', search: 'const x = 1;', replace: 'x' }), {
        workspaceRoot,
        locks,
        lockOwner: { runId: 'run-1', agentId: 'agent-1' },
      }),
    ).rejects.toBeInstanceOf(LockAlreadyHeldError);
    expect(readFileSync(join(workspaceRoot, 'a.txt'), 'utf-8')).toBe('const x = 1;');
  });

  it('releases the lock after a successful edit', async () => {
    writeFileSync(join(workspaceRoot, 'a.txt'), 'const x = 1;');
    const locks = new LockManager();

    await editFileTool.execute(parse({ path: 'a.txt', search: 'const x = 1;', replace: 'const x = 2;' }), {
      workspaceRoot,
      locks,
      lockOwner: { runId: 'run-1', agentId: 'agent-1' },
    });

    expect(locks.isLocked(join(workspaceRoot, 'a.txt'))).toBe(false);
  });
});
