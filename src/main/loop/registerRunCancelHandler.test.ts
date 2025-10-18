import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
  return {
    ipcMain: {
      handle: (channel: string, listener: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, listener);
      },
      __invoke: (channel: string, payload: unknown) =>
        handlers.get(channel)?.({ sender: { id: 1 } }, payload),
    },
  };
});

describe('registerRunCancelHandler', () => {
  it('reports cancelled: true when the run is tracked', async () => {
    const { RunAbortRegistry } = await import('./runAbortRegistry');
    const { registerRunCancelHandler } = await import('./registerRunCancelHandler');
    const { ipcMain } = await import('electron');

    const registry = new RunAbortRegistry();
    registry.create('run-1');
    registerRunCancelHandler(registry);

    const invoke = (ipcMain as unknown as { __invoke: (c: string, p: unknown) => Promise<unknown> })
      .__invoke;
    const result = (await invoke('run:cancel', { runId: 'run-1' })) as {
      data: { cancelled: boolean };
    };

    expect(result.data.cancelled).toBe(true);
    expect(registry.get('run-1')?.signal.aborted).toBe(true);
  });

  it('reports cancelled: false for an untracked run', async () => {
    const { RunAbortRegistry } = await import('./runAbortRegistry');
    const { registerRunCancelHandler } = await import('./registerRunCancelHandler');
    const { ipcMain } = await import('electron');

    const registry = new RunAbortRegistry();
    registerRunCancelHandler(registry);

    const invoke = (ipcMain as unknown as { __invoke: (c: string, p: unknown) => Promise<unknown> })
      .__invoke;
    const result = (await invoke('run:cancel', { runId: 'missing' })) as {
      data: { cancelled: boolean };
    };

    expect(result.data.cancelled).toBe(false);
  });

  it('rejects a malformed payload', async () => {
    const { RunAbortRegistry } = await import('./runAbortRegistry');
    const { registerRunCancelHandler } = await import('./registerRunCancelHandler');
    const { ipcMain } = await import('electron');

    registerRunCancelHandler(new RunAbortRegistry());

    const invoke = (ipcMain as unknown as { __invoke: (c: string, p: unknown) => Promise<unknown> })
      .__invoke;
    const result = (await invoke('run:cancel', { runId: '' })) as {
      ok: boolean;
      error?: { code: string };
    };

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_PAYLOAD');
  });
});
