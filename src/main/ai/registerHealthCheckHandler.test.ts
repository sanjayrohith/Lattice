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

vi.mock('./healthCheck', () => ({
  checkProviderHealth: vi.fn(),
}));

describe('registerHealthCheckHandler', () => {
  it('returns ok without an error field on success', async () => {
    const { checkProviderHealth } = await import('./healthCheck');
    (checkProviderHealth as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    const { registerHealthCheckHandler } = await import('./registerHealthCheckHandler');
    const { ipcMain } = await import('electron');
    registerHealthCheckHandler({ get: () => 'sk-test' });

    const invoke = (ipcMain as unknown as { __invoke: (c: string, p: unknown) => Promise<unknown> })
      .__invoke;
    const result = (await invoke('ai:provider-health-check', {
      providerId: 'openai',
      modelId: 'gpt-4o',
    })) as { ok: boolean; data: { ok: boolean; error?: string } };

    expect(result.data).toEqual({ ok: true });
  });

  it('forwards the error message on failure', async () => {
    const { checkProviderHealth } = await import('./healthCheck');
    (checkProviderHealth as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: 'MISSING_CREDENTIAL',
    });

    const { registerHealthCheckHandler } = await import('./registerHealthCheckHandler');
    const { ipcMain } = await import('electron');
    registerHealthCheckHandler({ get: () => undefined });

    const invoke = (ipcMain as unknown as { __invoke: (c: string, p: unknown) => Promise<unknown> })
      .__invoke;
    const result = (await invoke('ai:provider-health-check', {
      providerId: 'openai',
      modelId: 'gpt-4o',
    })) as { data: { ok: boolean; error?: string } };

    expect(result.data).toEqual({ ok: false, error: 'MISSING_CREDENTIAL' });
  });

  it('rejects a malformed request before calling checkProviderHealth', async () => {
    const { checkProviderHealth } = await import('./healthCheck');
    (checkProviderHealth as ReturnType<typeof vi.fn>).mockReset();

    const { registerHealthCheckHandler } = await import('./registerHealthCheckHandler');
    const { ipcMain } = await import('electron');
    registerHealthCheckHandler({ get: () => undefined });

    const invoke = (ipcMain as unknown as { __invoke: (c: string, p: unknown) => Promise<unknown> })
      .__invoke;
    const result = (await invoke('ai:provider-health-check', { providerId: 'unknown', modelId: '' })) as {
      ok: boolean;
      error?: { code: string };
    };

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_PAYLOAD');
    expect(checkProviderHealth).not.toHaveBeenCalled();
  });
});
