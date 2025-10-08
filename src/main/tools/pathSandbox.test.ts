import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveWorkspacePath, WorkspacePathEscapeError } from './pathSandbox';

describe('resolveWorkspacePath', () => {
  let workspaceRoot: string;
  let outsideDir: string;

  beforeEach(() => {
    workspaceRoot = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-sandbox-workspace-')));
    outsideDir = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-sandbox-outside-')));
    mkdirSync(join(workspaceRoot, 'nested'), { recursive: true });
    writeFileSync(join(workspaceRoot, 'nested', 'file.txt'), 'hello');
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
    rmSync(outsideDir, { recursive: true, force: true });
  });

  it('resolves a simple relative path inside the workspace', () => {
    const resolved = resolveWorkspacePath(workspaceRoot, 'nested/file.txt');
    expect(resolved).toBe(join(workspaceRoot, 'nested', 'file.txt'));
  });

  it('resolves the workspace root itself', () => {
    expect(resolveWorkspacePath(workspaceRoot, '.')).toBe(workspaceRoot);
  });

  it('resolves a path to a file that does not exist yet, for write_file', () => {
    const resolved = resolveWorkspacePath(workspaceRoot, 'nested/new-file.txt');
    expect(resolved).toBe(join(workspaceRoot, 'nested', 'new-file.txt'));
  });

  it('resolves a deeply nested path where no ancestor exists yet', () => {
    const resolved = resolveWorkspacePath(workspaceRoot, 'a/b/c/new-file.txt');
    expect(resolved).toBe(join(workspaceRoot, 'a', 'b', 'c', 'new-file.txt'));
  });

  it('rejects a simple ".." traversal escaping the workspace', () => {
    expect(() => resolveWorkspacePath(workspaceRoot, '../escape.txt')).toThrow(
      WorkspacePathEscapeError,
    );
  });

  it('rejects a traversal that dips outside and back in, when the net result still escapes', () => {
    expect(() => resolveWorkspacePath(workspaceRoot, '../../../../../../../etc/passwd')).toThrow(
      WorkspacePathEscapeError,
    );
  });

  it('rejects an absolute path outside the workspace', () => {
    expect(() => resolveWorkspacePath(workspaceRoot, join(outsideDir, 'secret.txt'))).toThrow(
      WorkspacePathEscapeError,
    );
  });

  it('allows an absolute path that happens to be inside the workspace', () => {
    const absolutePath = join(workspaceRoot, 'nested', 'file.txt');
    expect(resolveWorkspacePath(workspaceRoot, absolutePath)).toBe(absolutePath);
  });

  it('rejects a symlink inside the workspace pointing outside it', () => {
    const linkPath = join(workspaceRoot, 'escape-link');
    symlinkSync(outsideDir, linkPath);

    expect(() => resolveWorkspacePath(workspaceRoot, 'escape-link/secret.txt')).toThrow(
      WorkspacePathEscapeError,
    );
  });

  it('allows a symlink inside the workspace pointing to another location inside it', () => {
    const targetDir = join(workspaceRoot, 'real-target');
    mkdirSync(targetDir);
    writeFileSync(join(targetDir, 'file.txt'), 'ok');
    const linkPath = join(workspaceRoot, 'inside-link');
    symlinkSync(targetDir, linkPath);

    const resolved = resolveWorkspacePath(workspaceRoot, 'inside-link/file.txt');
    expect(resolved).toBe(join(targetDir, 'file.txt'));
  });

  it('the error carries the original requested path for diagnostics', () => {
    try {
      resolveWorkspacePath(workspaceRoot, '../escape.txt');
      expect.unreachable('expected resolveWorkspacePath to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(WorkspacePathEscapeError);
      expect((error as WorkspacePathEscapeError).requestedPath).toBe('../escape.txt');
      expect((error as WorkspacePathEscapeError).code).toBe('PATH_ESCAPE');
    }
  });
});
