import { describe, expect, it, vi } from 'vitest';

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

vi.mock('electron-log/main', () => {
  const calls: Array<{ level: string; args: unknown[] }> = [];
  const makeLevel = (level: string) => (...args: unknown[]) => calls.push({ level, args });
  return {
    default: {
      initialize: vi.fn(),
      transports: { file: {}, console: {} },
      hooks: { push: vi.fn() },
      info: makeLevel('info'),
      warn: makeLevel('warn'),
      error: makeLevel('error'),
      debug: makeLevel('debug'),
      __calls: calls,
    },
  };
});

describe('registerLogHandler', () => {
  it('forwards a renderer-emitted log entry into the shared log stream, tagged with its origin', async () => {
    const { ipcMain } = await import('electron');
    const logModule = await import('electron-log/main');
    const { registerLogHandler } = await import('./registerLogHandler');

    registerLogHandler();

    await (
      ipcMain as unknown as { __invoke: (c: string, p: unknown) => Promise<unknown> }
    ).__invoke('log:write', { level: 'warn', message: 'panel crashed' });

    const calls = (logModule.default as unknown as { __calls: Array<{ level: string; args: unknown[] }> })
      .__calls;

    expect(calls).toContainEqual({ level: 'warn', args: ['[renderer] panel crashed', {}] });
  });
});
