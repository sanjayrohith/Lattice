import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let userDataPath: string;

beforeEach(() => {
  userDataPath = mkdtempSync(join(tmpdir(), 'lattice-layout-handlers-'));
});

afterEach(() => {
  rmSync(userDataPath, { recursive: true, force: true });
});

vi.mock('electron', () => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
  return {
    app: { getPath: vi.fn() },
    ipcMain: {
      handle: (channel: string, listener: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, listener);
      },
      __invoke: (channel: string, payload: unknown) =>
        handlers.get(channel)?.({ sender: { id: 1 } }, payload),
    },
  };
});

describe('registerLayoutHandlers', () => {
  it('saves and loads a layout for a workspace round-trip', async () => {
    const { app, ipcMain } = await import('electron');
    (app.getPath as ReturnType<typeof vi.fn>).mockReturnValue(userDataPath);

    const { registerLayoutHandlers } = await import('./registerLayoutHandlers');
    registerLayoutHandlers();

    const layout = { panels: { conversation: {} } };
    const saveResult = (await (
      ipcMain as unknown as { __invoke: (c: string, p: unknown) => Promise<unknown> }
    ).__invoke('layout:save', { workspaceId: 'default', layout })) as { ok: boolean };
    expect(saveResult.ok).toBe(true);

    const loadResult = (await (
      ipcMain as unknown as { __invoke: (c: string, p: unknown) => Promise<unknown> }
    ).__invoke('layout:load', { workspaceId: 'default' })) as {
      ok: boolean;
      data?: { layout: unknown };
    };

    expect(loadResult.ok).toBe(true);
    expect(loadResult.data?.layout).toEqual(layout);
  });

  it('returns a null layout for a workspace that has never been saved', async () => {
    const { app, ipcMain } = await import('electron');
    (app.getPath as ReturnType<typeof vi.fn>).mockReturnValue(userDataPath);

    const { registerLayoutHandlers } = await import('./registerLayoutHandlers');
    registerLayoutHandlers();

    const result = (await (
      ipcMain as unknown as { __invoke: (c: string, p: unknown) => Promise<unknown> }
    ).__invoke('layout:load', { workspaceId: 'never-saved' })) as {
      ok: boolean;
      data?: { layout: unknown };
    };

    expect(result.ok).toBe(true);
    expect(result.data?.layout).toBeNull();
  });
});
