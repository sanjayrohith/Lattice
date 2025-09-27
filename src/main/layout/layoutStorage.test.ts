import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadLayout, saveLayout } from './layoutStorage';

let userDataPath: string;

beforeEach(() => {
  userDataPath = mkdtempSync(join(tmpdir(), 'lattice-layout-'));
});

afterEach(() => {
  rmSync(userDataPath, { recursive: true, force: true });
});

describe('layoutStorage', () => {
  it('returns null when no layout has been saved for a workspace', () => {
    expect(loadLayout(userDataPath, 'default')).toBeNull();
  });

  it('round-trips a saved layout', () => {
    const layout = { grid: { root: {} }, panels: {} };
    saveLayout(userDataPath, 'default', layout);
    expect(loadLayout(userDataPath, 'default')).toEqual(layout);
  });

  it('keeps layouts for different workspaces independent', () => {
    saveLayout(userDataPath, 'workspace-a', { id: 'a' });
    saveLayout(userDataPath, 'workspace-b', { id: 'b' });

    expect(loadLayout(userDataPath, 'workspace-a')).toEqual({ id: 'a' });
    expect(loadLayout(userDataPath, 'workspace-b')).toEqual({ id: 'b' });
  });

  it('sanitizes a workspace id containing path-traversal characters', () => {
    saveLayout(userDataPath, '../../etc/passwd', { hacked: true });
    expect(loadLayout(userDataPath, '../../etc/passwd')).toEqual({ hacked: true });
  });
});
