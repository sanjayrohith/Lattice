import { describe, expect, it } from 'vitest';
import { chunkFile } from './chunker';

describe('chunkFile', () => {
  it('splits on top-level declaration boundaries and preserves line ranges', () => {
    const content = [
      'export function alpha() {',
      '  return 1;',
      '}',
      '',
      'export class Beta {',
      '  run() {}',
      '}',
    ].join('\n');

    const chunks = chunkFile('src/example.ts', content);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ filePath: 'src/example.ts', startLine: 1, endLine: 4 });
    expect(chunks[0]?.content).toContain('export function alpha()');
    expect(chunks[1]).toMatchObject({ startLine: 5, endLine: 7 });
    expect(chunks[1]?.content).toContain('export class Beta');
  });

  it('falls back to an overlapping sliding window when no boundaries are found', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `prose line ${i + 1}`);
    const chunks = chunkFile('README.md', lines.join('\n'), { maxLines: 10, windowOverlap: 3 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toMatchObject({ startLine: 1, endLine: 10 });
    expect(chunks[1]?.startLine).toBe(8);
    expect(chunks.at(-1)?.endLine).toBe(20);
  });

  it('splits a single declaration wider than maxLines into consecutive sub-chunks', () => {
    const body = Array.from({ length: 30 }, (_, i) => `  line${i}`).join('\n');
    const content = `export function big() {\n${body}\n}`;

    const chunks = chunkFile('src/big.ts', content, { maxLines: 10 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.startLine).toBe(1);
    expect(chunks.at(-1)?.endLine).toBe(content.split('\n').length);
  });

  it('returns no chunks for empty content', () => {
    expect(chunkFile('empty.txt', '')).toEqual([{ filePath: 'empty.txt', startLine: 1, endLine: 1, content: '' }]);
  });
});
