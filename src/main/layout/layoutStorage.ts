import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

function layoutPath(userDataPath: string, workspaceId: string): string {
  const safeId = workspaceId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return join(userDataPath, 'layouts', `${safeId}.json`);
}

export function saveLayout(userDataPath: string, workspaceId: string, layout: unknown): void {
  const path = layoutPath(userDataPath, workspaceId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(layout), 'utf8');
}

export function loadLayout(userDataPath: string, workspaceId: string): unknown | null {
  try {
    const raw = readFileSync(layoutPath(userDataPath, workspaceId), 'utf8');
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
