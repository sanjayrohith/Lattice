import { ipcMain } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { DelegationTreeRegistry } from './delegationTreeRegistry';
import { registerDelegationTreeHandler } from './registerDelegationTreeHandler';

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

describe('registerDelegationTreeHandler', () => {
  let registry: DelegationTreeRegistry;

  beforeEach(() => {
    registry = new DelegationTreeRegistry();
    registerDelegationTreeHandler(registry);
  });

  it('returns the tree rooted at the requested run', async () => {
    registry.addNode({ runId: 'root', parentRunId: null, agentId: 'orchestrator', startedAt: 0 });
    registry.addNode({ runId: 'child', parentRunId: 'root', agentId: 'coder', startedAt: 1 });

    const result = await invoke<{ ok: true; data: { nodes: { runId: string }[] } }>(IPC_CHANNELS.DELEGATION_TREE, {
      rootRunId: 'root',
    });

    expect(result.data.nodes.map((n) => n.runId)).toEqual(['root', 'child']);
  });

  it('returns an empty node list for an unknown root', async () => {
    const result = await invoke<{ ok: true; data: { nodes: unknown[] } }>(IPC_CHANNELS.DELEGATION_TREE, {
      rootRunId: 'missing',
    });
    expect(result.data.nodes).toEqual([]);
  });
});
