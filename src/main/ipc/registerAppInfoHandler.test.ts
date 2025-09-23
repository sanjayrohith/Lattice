import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
  return {
    app: {
      getVersion: () => '0.1.0',
      getPath: (name: string) => `/tmp/lattice-${name}`,
    },
    ipcMain: {
      handle: (channel: string, listener: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, listener);
      },
      __invoke: (channel: string, payload: unknown) => handlers.get(channel)?.(undefined, payload),
    },
  };
});

describe('registerAppInfoHandler', () => {
  it('responds with app version, runtime versions, platform, and userData path', async () => {
    const { ipcMain } = await import('electron');
    const { registerAppInfoHandler } = await import('./registerAppInfoHandler');

    registerAppInfoHandler();

    const result = (await (
      ipcMain as unknown as { __invoke: (c: string, p: unknown) => Promise<unknown> }
    ).__invoke('app:info', undefined)) as {
      ok: boolean;
      data?: {
        appVersion: string;
        platform: string;
        userDataPath: string;
      };
    };

    expect(result.ok).toBe(true);
    expect(result.data?.appVersion).toBe('0.1.0');
    expect(result.data?.platform).toBe(process.platform);
    expect(result.data?.userDataPath).toBe('/tmp/lattice-userData');
  });
});
