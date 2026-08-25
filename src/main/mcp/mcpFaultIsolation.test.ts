import { describe, expect, it, vi } from 'vitest';
import { isolateMcpServerFailure, withTimeout } from './mcpFaultIsolation';

describe('withTimeout', () => {
  it('resolves with the promise result when it settles before the timeout', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'timed out')).resolves.toBe('ok');
  });

  it('rejects with the timeout message when the promise never settles in time', async () => {
    const neverSettles = new Promise<string>(() => undefined);
    await expect(withTimeout(neverSettles, 10, 'timed out')).rejects.toThrow('timed out');
  });

  it('propagates a rejection from the underlying promise', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000, 'timed out')).rejects.toThrow('boom');
  });
});

describe('isolateMcpServerFailure', () => {
  it('returns the operation result on success', async () => {
    const result = await isolateMcpServerFailure('server-1', 'discovery', async () => 'value', 'fallback');
    expect(result).toBe('value');
  });

  it('returns the fallback and logs a warning when the operation throws', async () => {
    const logger = { warn: vi.fn() };
    const result = await isolateMcpServerFailure(
      'server-1',
      'discovery',
      async () => {
        throw new Error('crashed');
      },
      [],
      { logger },
    );

    expect(result).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('server-1'));
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('crashed'));
  });

  it('returns the fallback and logs a warning when the operation hangs past the timeout', async () => {
    const logger = { warn: vi.fn() };
    const result = await isolateMcpServerFailure(
      'server-1',
      'discovery',
      () => new Promise(() => undefined),
      'fallback',
      { timeoutMs: 10, logger },
    );

    expect(result).toBe('fallback');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('timed out'));
  });
});
