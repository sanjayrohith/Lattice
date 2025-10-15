import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { grepSearchTool } from './grepSearch';
import { WorkspacePathEscapeError } from './pathSandbox';

describe('grepSearchTool', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'lattice-grep-test-'));
    writeFileSync(join(workspaceRoot, 'a.txt'), 'hello world\nfoo bar\nHELLO again');
    mkdirSync(join(workspaceRoot, 'src'));
    writeFileSync(join(workspaceRoot, 'src', 'b.ts'), 'const hello = 1;\nconst other = 2;');
    mkdirSync(join(workspaceRoot, 'node_modules'));
    writeFileSync(join(workspaceRoot, 'node_modules', 'pkg.js'), 'hello from a dependency');
    writeFileSync(join(workspaceRoot, 'image.bin'), Buffer.from([0x00, 0x01, 0x68, 0x65, 0x6c]));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  function parse(input: Record<string, unknown>) {
    return grepSearchTool.inputSchema.parse(input);
  }

  it('finds matches across nested files with file, line, and text', async () => {
    const result = await grepSearchTool.execute(parse({ pattern: 'hello' }), { workspaceRoot });

    expect(result.matches).toEqual(
      expect.arrayContaining([
        { file: 'a.txt', line: 1, text: 'hello world' },
        { file: join('src', 'b.ts'), line: 1, text: 'const hello = 1;' },
      ]),
    );
  });

  it('is case sensitive by default', async () => {
    const result = await grepSearchTool.execute(parse({ pattern: 'HELLO' }), { workspaceRoot });

    expect(result.matches).toEqual([{ file: 'a.txt', line: 3, text: 'HELLO again' }]);
  });

  it('matches case-insensitively when requested', async () => {
    const result = await grepSearchTool.execute(parse({ pattern: 'hello', caseSensitive: false }), {
      workspaceRoot,
    });

    const texts = result.matches.map((m) => m.text);
    expect(texts).toContain('hello world');
    expect(texts).toContain('HELLO again');
  });

  it('excludes node_modules by default', async () => {
    const result = await grepSearchTool.execute(parse({ pattern: 'hello' }), { workspaceRoot });

    expect(result.matches.some((m) => m.file.includes('node_modules'))).toBe(false);
  });

  it('skips binary files', async () => {
    const result = await grepSearchTool.execute(parse({ pattern: 'hel' }), { workspaceRoot });

    expect(result.matches.some((m) => m.file === 'image.bin')).toBe(false);
  });

  it('caps results at maxResults and reports truncated', async () => {
    for (let i = 0; i < 10; i++) {
      writeFileSync(join(workspaceRoot, `f${i}.txt`), 'needle\nneedle\nneedle');
    }

    const result = await grepSearchTool.execute(parse({ pattern: 'needle', maxResults: 5 }), {
      workspaceRoot,
    });

    expect(result.matches).toHaveLength(5);
    expect(result.truncated).toBe(true);
  });

  it('reports truncated: false when under the cap', async () => {
    const result = await grepSearchTool.execute(parse({ pattern: 'hello' }), { workspaceRoot });
    expect(result.truncated).toBe(false);
  });

  it('rejects a path that escapes the workspace', async () => {
    await expect(
      grepSearchTool.execute(parse({ pattern: 'x', path: '../' }), { workspaceRoot }),
    ).rejects.toBeInstanceOf(WorkspacePathEscapeError);
  });

  it('has always consent since it can only read', () => {
    expect(grepSearchTool.defaultConsent).toBe('always');
  });
});
