import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { indexWorkspace } from './workspaceIndexer';

describe('indexWorkspace', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'lattice-indexer-'));
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('reports every file as added on the first pass', async () => {
    await writeFile(join(workspaceRoot, 'a.ts'), 'export const a = 1;');
    await mkdir(join(workspaceRoot, 'nested'));
    await writeFile(join(workspaceRoot, 'nested', 'b.ts'), 'export const b = 2;');

    const result = await indexWorkspace(workspaceRoot, {});

    expect([...result.changes].sort((x, y) => x.path.localeCompare(y.path))).toEqual([
      { path: 'a.ts', kind: 'added' },
      { path: 'nested/b.ts', kind: 'added' },
    ]);
    expect(Object.keys(result.snapshot)).toHaveLength(2);
  });

  it('reports no changes on a repeat pass over an unmodified workspace', async () => {
    await writeFile(join(workspaceRoot, 'a.ts'), 'export const a = 1;');
    const first = await indexWorkspace(workspaceRoot, {});

    const second = await indexWorkspace(workspaceRoot, first.snapshot);

    expect(second.changes).toEqual([]);
  });

  it('detects modifications, additions, and deletions relative to the previous snapshot', async () => {
    await writeFile(join(workspaceRoot, 'a.ts'), 'export const a = 1;');
    await writeFile(join(workspaceRoot, 'b.ts'), 'export const b = 1;');
    const first = await indexWorkspace(workspaceRoot, {});

    await writeFile(join(workspaceRoot, 'a.ts'), 'export const a = 2;');
    await rm(join(workspaceRoot, 'b.ts'));
    await writeFile(join(workspaceRoot, 'c.ts'), 'export const c = 1;');

    const second = await indexWorkspace(workspaceRoot, first.snapshot);

    expect([...second.changes].sort((x, y) => x.path.localeCompare(y.path))).toEqual([
      { path: 'a.ts', kind: 'modified' },
      { path: 'b.ts', kind: 'deleted' },
      { path: 'c.ts', kind: 'added' },
    ]);
  });

  it('skips paths matching an ignore pattern', async () => {
    await mkdir(join(workspaceRoot, 'node_modules'));
    await writeFile(join(workspaceRoot, 'node_modules', 'dep.js'), 'module.exports = {};');
    await writeFile(join(workspaceRoot, 'a.ts'), 'export const a = 1;');

    const result = await indexWorkspace(workspaceRoot, {});

    expect(result.changes).toEqual([{ path: 'a.ts', kind: 'added' }]);
  });
});
