import { ipcMain } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { LockManager } from './lockManager';
import { registerLockHandlers } from './registerLockHandlers';

vi.mock('electron', () => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
  return {
    ipcMain: {
      handle: vi.fn((channel: string, handler: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, handler);
      }),
      _invoke: async (channel: string, payload: unknown) => {
        const handler = handlers.get(channel);
        if (!handler) throw new Error(`no handler for ${channel}`);
        return handler({ sender: { id: 1 } }, payload);
      },
    },
  };
});

async function invoke<T>(channel: string, payload: unknown): Promise<T> {
  return (await (ipcMain as unknown as { _invoke: (c: string, p: unknown) => Promise<T> })._invoke(
    channel,
    payload,
  )) as T;
}

describe('registerLockHandlers', () => {
  let manager: LockManager;

  beforeEach(() => {
    manager = new LockManager();
    registerLockHandlers(manager);
  });

  it('lists every currently held lock', async () => {
    manager.acquire('/a.txt', { runId: 'run-1', agentId: 'agent-1' });

    const result = await invoke<{ ok: true; data: { locks: { path: string }[] } }>(IPC_CHANNELS.LOCKS_LIST, undefined);
    expect(result.data.locks).toHaveLength(1);
  });

  it('force-releases a lock', async () => {
    manager.acquire('/a.txt', { runId: 'run-1', agentId: 'agent-1' });

    const result = await invoke<{ ok: true; data: { released: boolean } }>(IPC_CHANNELS.LOCKS_FORCE_RELEASE, {
      path: '/a.txt',
    });
    expect(result.data.released).toBe(true);
    expect(manager.isLocked('/a.txt')).toBe(false);
  });

  it('reports released: false for a path with no lock', async () => {
    const result = await invoke<{ ok: true; data: { released: boolean } }>(IPC_CHANNELS.LOCKS_FORCE_RELEASE, {
      path: '/missing.txt',
    });
    expect(result.data.released).toBe(false);
  });
});
