import { describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '@shared/ipc/channels';

vi.mock('electron', () => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
  return {
    ipcMain: {
      handle: (channel: string, listener: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, listener);
      },
      __invoke: (channel: string, payload: unknown) => handlers.get(channel)?.({ sender: { id: 1 } }, payload),
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

  it('never leaks a raw stack trace through the failure envelope', async () => {
    const { ipcMain } = await import('electron');
    const { registerHandler } = await import('./registerHandler');

    registerHandler(IPC_CHANNELS.APP_INFO, () => {
      throw new Error('boom');
    });

    const result = (await (
      ipcMain as unknown as { __invoke: (c: string, p: unknown) => Promise<unknown> }
    ).__invoke('app:info', undefined)) as { ok: boolean; error?: Record<string, unknown> };

    expect(result.ok).toBe(false);
    expect(result.error).toEqual({ code: 'HANDLER_ERROR', message: 'boom' });
    expect(result.error?.['stack']).toBeUndefined();
  });

  it('rejects a handler result that violates the response schema as INVALID_RESPONSE', async () => {
    const { ipcMain } = await import('electron');
    const { registerHandler } = await import('./registerHandler');

    registerHandler(IPC_CHANNELS.WINDOW_POPOUT, () => ({
      windowId: 'not-a-number' as unknown as number,
    }));

    const result = (await (
      ipcMain as unknown as { __invoke: (c: string, p: unknown) => Promise<unknown> }
    ).__invoke('window:popout', { panelId: 'conversation' })) as {
      ok: boolean;
      error?: { code: string };
    };

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_RESPONSE');
  });

  it('normalizes a non-Error throw (string, object) without crashing the handler pipeline', async () => {
    const { ipcMain } = await import('electron');
    const { registerHandler } = await import('./registerHandler');

    registerHandler(IPC_CHANNELS.LOG_WRITE, () => {
      throw 'a plain string was thrown';
    });

    const result = (await (
      ipcMain as unknown as { __invoke: (c: string, p: unknown) => Promise<unknown> }
    ).__invoke('log:write', { level: 'info', message: 'hi' })) as {
      ok: boolean;
      error?: { code: string; message: string };
    };

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('HANDLER_ERROR');
    expect(result.error?.message).toBe('a plain string was thrown');
  });
});
