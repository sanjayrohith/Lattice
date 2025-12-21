import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectEncoding, READ_FILE_MAX_BYTES, readFileTool } from './readFile';
import { WorkspacePathEscapeError } from './pathSandbox';
import { SeenRangeTracker } from '../memory/seenRangeTracker';

describe('detectEncoding', () => {
  it('detects plain ascii text as utf-8', () => {
    expect(detectEncoding(Buffer.from('hello world', 'utf-8'))).toBe('utf-8');
  });

  it('detects a utf-8 BOM as utf-8', () => {
    const buffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hello', 'utf-8')]);
    expect(detectEncoding(buffer)).toBe('utf-8');
  });

  it('detects a buffer containing a NUL byte as binary', () => {
    expect(detectEncoding(Buffer.from([0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]))).toBe('binary');
  });
});

describe('readFileTool', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'lattice-read-file-test-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('reads the full content of a small text file', async () => {
    writeFileSync(join(workspaceRoot, 'a.txt'), 'line one\nline two\nline three');

    const result = await readFileTool.execute(
      readFileTool.inputSchema.parse({ path: 'a.txt' }),
      { workspaceRoot },
    );

    expect(result).toEqual({
      content: 'line one\nline two\nline three',
      encoding: 'utf-8',
      truncated: false,
      totalLines: 3,
    });
  });

  it('selects an inclusive 1-indexed line range', async () => {
    writeFileSync(join(workspaceRoot, 'a.txt'), 'one\ntwo\nthree\nfour\nfive');

    const result = await readFileTool.execute(
      readFileTool.inputSchema.parse({ path: 'a.txt', startLine: 2, endLine: 4 }),
      { workspaceRoot },
    );

    expect(result.content).toBe('two\nthree\nfour');
    expect(result.totalLines).toBe(5);
  });

  it('clamps an out-of-range endLine to the last line', async () => {
    writeFileSync(join(workspaceRoot, 'a.txt'), 'one\ntwo\nthree');

    const result = await readFileTool.execute(
      readFileTool.inputSchema.parse({ path: 'a.txt', startLine: 2, endLine: 100 }),
      { workspaceRoot },
    );

    expect(result.content).toBe('two\nthree');
  });

  it('truncates content beyond the byte cap and reports truncated: true', async () => {
    writeFileSync(join(workspaceRoot, 'big.txt'), 'x'.repeat(READ_FILE_MAX_BYTES + 500));

    const result = await readFileTool.execute(
      readFileTool.inputSchema.parse({ path: 'big.txt' }),
      { workspaceRoot },
    );

    expect(result.truncated).toBe(true);
    expect(result.content.length).toBeLessThanOrEqual(READ_FILE_MAX_BYTES);
  });

  it('returns empty content with a binary encoding for a binary file', async () => {
    writeFileSync(join(workspaceRoot, 'image.bin'), Buffer.from([0x50, 0x4e, 0x47, 0x00, 0x01]));

    const result = await readFileTool.execute(
      readFileTool.inputSchema.parse({ path: 'image.bin' }),
      { workspaceRoot },
    );

    expect(result.encoding).toBe('binary');
    expect(result.content).toBe('');
  });

  it('rejects a path that escapes the workspace', async () => {
    await expect(
      readFileTool.execute(readFileTool.inputSchema.parse({ path: '../escape.txt' }), {
        workspaceRoot,
      }),
    ).rejects.toBeInstanceOf(WorkspacePathEscapeError);
  });

  it('has always consent since it can only read', () => {
    expect(readFileTool.defaultConsent).toBe('always');
  });

  it('rejects an empty path at the schema level', () => {
    expect(() => readFileTool.inputSchema.parse({ path: '' })).toThrow();
  });

  it('marks the read range as seen when a seenRanges tracker is provided', async () => {
    writeFileSync(join(workspaceRoot, 'a.txt'), 'one\ntwo\nthree\nfour\nfive');
    const seenRanges = new SeenRangeTracker();

    await readFileTool.execute(readFileTool.inputSchema.parse({ path: 'a.txt', startLine: 2, endLine: 4 }), {
      workspaceRoot,
      seenRanges,
    });

    expect(seenRanges.isFullyCovered('a.txt', { startLine: 2, endLine: 4 })).toBe(true);
    expect(seenRanges.isFullyCovered('a.txt', { startLine: 1, endLine: 5 })).toBe(false);
  });
});
