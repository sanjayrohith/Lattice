import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeFileTool } from './writeFile';
import { WorkspacePathEscapeError } from './pathSandbox';

describe('writeFileTool', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'lattice-write-file-test-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  function parse(input: Record<string, unknown>) {
    return writeFileTool.inputSchema.parse(input);
  }

  it('writes a new file at the workspace root', async () => {
    const result = await writeFileTool.execute(parse({ path: 'a.txt', content: 'hello' }), {
      workspaceRoot,
    });

    expect(readFileSync(join(workspaceRoot, 'a.txt'), 'utf-8')).toBe('hello');
    expect(result).toEqual({ path: 'a.txt', bytesWritten: 5 });
  });

  it('creates missing parent directories', async () => {
    await writeFileTool.execute(parse({ path: 'a/b/c/file.txt', content: 'nested' }), {
      workspaceRoot,
    });

    expect(readFileSync(join(workspaceRoot, 'a', 'b', 'c', 'file.txt'), 'utf-8')).toBe('nested');
  });

  it('overwrites an existing file', async () => {
    writeFileSync(join(workspaceRoot, 'a.txt'), 'old content');

    await writeFileTool.execute(parse({ path: 'a.txt', content: 'new content' }), { workspaceRoot });

    expect(readFileSync(join(workspaceRoot, 'a.txt'), 'utf-8')).toBe('new content');
  });

  it('leaves no temp file behind after a successful write', async () => {
    await writeFileTool.execute(parse({ path: 'a.txt', content: 'hello' }), { workspaceRoot });

    const entries = readdirSync(workspaceRoot);
    expect(entries).toEqual(['a.txt']);
  });

  it('reports the correct byte count for multi-byte utf-8 content', async () => {
    const content = 'héllo 🌍';
    const result = await writeFileTool.execute(parse({ path: 'a.txt', content }), { workspaceRoot });

    expect(result.bytesWritten).toBe(Buffer.byteLength(content, 'utf-8'));
  });

  it('rejects a path that escapes the workspace', async () => {
    await expect(
      writeFileTool.execute(parse({ path: '../escape.txt', content: 'x' }), { workspaceRoot }),
    ).rejects.toBeInstanceOf(WorkspacePathEscapeError);

    expect(existsSync(join(workspaceRoot, '..', 'escape.txt'))).toBe(false);
  });

  it('requires consent since it can create or overwrite content', () => {
    expect(writeFileTool.defaultConsent).toBe('ask');
  });
});
