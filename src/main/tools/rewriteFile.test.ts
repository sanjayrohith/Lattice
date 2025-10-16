import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rewriteFileTool } from './rewriteFile';
import { WorkspacePathEscapeError } from './pathSandbox';

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
});
