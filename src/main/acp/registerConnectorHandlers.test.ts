import { ipcMain } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { ConnectorConfigStore } from './connectorConfig';
import { registerConnectorHandlers } from './registerConnectorHandlers';

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

describe('registerConnectorHandlers', () => {
  let store: ConnectorConfigStore;

  beforeEach(() => {
    store = new ConnectorConfigStore([]);
  });

  it('lists connectors with default stopped health when never tested', async () => {
    store.upsert({
      id: 'c1',
      displayName: 'C1',
      transport: 'stdio',
      command: 'x',
      args: [],
      env: {},
      enabled: true,
    });
    registerConnectorHandlers(store, vi.fn().mockResolvedValue(undefined));

    const result = await invoke<{ ok: true; data: { connectors: unknown[] } }>(
      IPC_CHANNELS.ACP_CONNECTOR_LIST,
      undefined,
    );
    expect(result.ok).toBe(true);
    expect(result.data.connectors).toHaveLength(1);
  });

  it('upserts a connector config', async () => {
    registerConnectorHandlers(store, vi.fn().mockResolvedValue(undefined));

    const result = await invoke<{ ok: true; data: { config: { id: string } } }>(
      IPC_CHANNELS.ACP_CONNECTOR_UPSERT,
      {
        config: {
          id: 'c2',
          displayName: 'C2',
          transport: 'http',
          url: 'https://agent.example/rpc',
        },
      },
    );
    expect(result.ok).toBe(true);
    expect(store.get('c2')?.displayName).toBe('C2');
  });

  it('deletes a connector config', async () => {
    store.upsert({
      id: 'c3',
      displayName: 'C3',
      transport: 'stdio',
      command: 'x',
      args: [],
      env: {},
      enabled: true,
    });
    registerConnectorHandlers(store, vi.fn().mockResolvedValue(undefined));

    const result = await invoke<{ ok: true; data: { deleted: boolean } }>(IPC_CHANNELS.ACP_CONNECTOR_DELETE, {
      id: 'c3',
    });
    expect(result.data.deleted).toBe(true);
    expect(store.get('c3')).toBeUndefined();
  });

  it('sets enabled state', async () => {
    store.upsert({
      id: 'c4',
      displayName: 'C4',
      transport: 'stdio',
      command: 'x',
      args: [],
      env: {},
      enabled: true,
    });
    registerConnectorHandlers(store, vi.fn().mockResolvedValue(undefined));

    const result = await invoke<{ ok: true; data: { config: { enabled: boolean } | null } }>(
      IPC_CHANNELS.ACP_CONNECTOR_SET_ENABLED,
      { id: 'c4', enabled: false },
    );
    expect(result.data.config?.enabled).toBe(false);
  });

  it('tests a connector, reporting success or a captured start error', async () => {
    store.upsert({
      id: 'c5',
      displayName: 'C5',
      transport: 'stdio',
      command: 'x',
      args: [],
      env: {},
      enabled: true,
    });
    const startConnector = vi.fn().mockRejectedValueOnce(new Error('boom'));
    registerConnectorHandlers(store, startConnector);

    const failure = await invoke<{ ok: true; data: { ok: boolean; error?: string } }>(
      IPC_CHANNELS.ACP_CONNECTOR_TEST,
      { id: 'c5' },
    );
    expect(failure.data).toEqual({ ok: false, error: 'boom' });

    startConnector.mockResolvedValueOnce(undefined);
    const success = await invoke<{ ok: true; data: { ok: boolean } }>(IPC_CHANNELS.ACP_CONNECTOR_TEST, {
      id: 'c5',
    });
    expect(success.data.ok).toBe(true);
  });
});
