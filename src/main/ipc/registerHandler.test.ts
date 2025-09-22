import { describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '@shared/ipc/channels';

vi.mock('electron', () => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
  return {
    ipcMain: {
      handle: (channel: string, listener: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, listener);
      },
      __invoke: (channel: string, payload: unknown) => handlers.get(channel)?.(undefined, payload),
    },
  };
});

describe('registerHandler', () => {
  it('invokes the handler and wraps the result in a success envelope', async () => {
    const { ipcMain } = await import('electron');
    const { registerHandler } = await import('./registerHandler');

    registerHandler(IPC_CHANNELS.APP_INFO, () => ({
      appVersion: '0.1.0',
      electronVersion: '33.0.0',
      chromeVersion: '130.0.0',
      platform: 'linux',
      userDataPath: '/tmp/lattice',
    }));

    const result = await (
      ipcMain as unknown as { __invoke: (c: string, p: unknown) => Promise<unknown> }
    ).__invoke('app:info', undefined);

    expect(result).toMatchObject({ ok: true, data: { appVersion: '0.1.0' } });
  });

  it('rejects a malformed request payload before the handler body executes', async () => {
    const { ipcMain } = await import('electron');
    const { registerHandler } = await import('./registerHandler');

    const handlerBody = vi.fn();
    registerHandler(IPC_CHANNELS.STATE_DISPATCH, handlerBody);

    const result = (await (
      ipcMain as unknown as { __invoke: (c: string, p: unknown) => Promise<unknown> }
    ).__invoke('state:dispatch', { patches: [] })) as { ok: boolean; error?: { code: string } };

    expect(handlerBody).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_PAYLOAD');
  });

  it('normalizes a thrown handler error into a structured failure envelope', async () => {
    const { ipcMain } = await import('electron');
    const { registerHandler } = await import('./registerHandler');

    registerHandler(IPC_CHANNELS.LAYOUT_LOAD, () => {
      throw new Error('disk read failed');
    });

    const result = (await (
      ipcMain as unknown as { __invoke: (c: string, p: unknown) => Promise<unknown> }
    ).__invoke('layout:load', { workspaceId: 'default' })) as {
      ok: boolean;
      error?: { code: string; message: string };
    };

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('HANDLER_ERROR');
    expect(result.error?.message).toBe('disk read failed');
  });
});
