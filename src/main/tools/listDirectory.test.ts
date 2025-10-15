import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listDirectoryTool } from './listDirectory';
import { WorkspacePathEscapeError } from './pathSandbox';

describe('listDirectoryTool', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'lattice-list-dir-test-'));
    writeFileSync(join(workspaceRoot, 'a.txt'), 'a');
    writeFileSync(join(workspaceRoot, 'b.log'), 'b');
    mkdirSync(join(workspaceRoot, 'src'));
    writeFileSync(join(workspaceRoot, 'src', 'index.ts'), 'x');
    mkdirSync(join(workspaceRoot, 'src', 'nested'));
    writeFileSync(join(workspaceRoot, 'src', 'nested', 'deep.ts'), 'y');
    mkdirSync(join(workspaceRoot, 'node_modules'));
    writeFileSync(join(workspaceRoot, 'node_modules', 'pkg.js'), 'z');
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  function parse(input: Record<string, unknown>) {
    return listDirectoryTool.inputSchema.parse(input);
  }

  it('lists only immediate children by default (maxDepth 1)', async () => {
    const result = await listDirectoryTool.execute(parse({}), { workspaceRoot });

    const paths = result.entries.map((e) => e.path).sort();
    expect(paths).toEqual(['a.txt', 'b.log', 'node_modules', 'src']);
    expect(result.entries.every((e) => e.depth === 1)).toBe(true);
  });

  it('annotates each entry with its type', async () => {
    const result = await listDirectoryTool.execute(parse({}), { workspaceRoot });

    const byPath = new Map(result.entries.map((e) => [e.path, e.type]));
    expect(byPath.get('a.txt')).toBe('file');
    expect(byPath.get('src')).toBe('directory');
  });

  it('descends further with a higher maxDepth', async () => {
    const result = await listDirectoryTool.execute(parse({ maxDepth: 3 }), { workspaceRoot });

    const paths = result.entries.map((e) => e.path).sort();
    expect(paths).toContain(join('src', 'index.ts'));
    expect(paths).toContain(join('src', 'nested'));
    expect(paths).toContain(join('src', 'nested', 'deep.ts'));
  });

  it('excludes entries matching an exact ignore pattern', async () => {
    const result = await listDirectoryTool.execute(parse({ ignorePatterns: ['node_modules'] }), {
      workspaceRoot,
    });

    expect(result.entries.map((e) => e.path)).not.toContain('node_modules');
  });

  it('excludes entries matching a wildcard ignore pattern', async () => {
    const result = await listDirectoryTool.execute(parse({ ignorePatterns: ['*.log'] }), {
      workspaceRoot,
    });

    expect(result.entries.map((e) => e.path)).not.toContain('b.log');
    expect(result.entries.map((e) => e.path)).toContain('a.txt');
  });

  it('does not descend into an ignored directory', async () => {
    const result = await listDirectoryTool.execute(
      parse({ maxDepth: 5, ignorePatterns: ['node_modules'] }),
      { workspaceRoot },
    );

    expect(result.entries.some((e) => e.path.startsWith('node_modules'))).toBe(false);
  });

  it('lists a specified subdirectory', async () => {
    const result = await listDirectoryTool.execute(parse({ path: 'src' }), { workspaceRoot });

    expect(result.entries.map((e) => e.path).sort()).toEqual(['index.ts', 'nested']);
  });

  it('rejects a path that escapes the workspace', async () => {
    await expect(
      listDirectoryTool.execute(parse({ path: '../' }), { workspaceRoot }),
    ).rejects.toBeInstanceOf(WorkspacePathEscapeError);
  });

  it('has always consent since it can only read directory metadata', () => {
    expect(listDirectoryTool.defaultConsent).toBe('always');
  });
});
