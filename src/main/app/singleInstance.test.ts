import { describe, expect, it, vi } from 'vitest';
import type { App, BrowserWindow } from 'electron';
import { enforceSingleInstanceLock } from './singleInstance';

function createMockApp(lockAcquired: boolean): App {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  return {
    requestSingleInstanceLock: () => lockAcquired,
    quit: vi.fn(),
    on: (event: string, listener: (...args: unknown[]) => void) => {
      listeners.set(event, listener);
    },
    __emit: (event: string) => listeners.get(event)?.(),
  } as unknown as App;
}

describe('enforceSingleInstanceLock', () => {
  it('quits immediately and returns false when the lock could not be acquired', () => {
    const mockApp = createMockApp(false);
    const result = enforceSingleInstanceLock(mockApp, () => undefined);

    expect(result).toBe(false);
    expect(mockApp.quit).toHaveBeenCalledOnce();
  });

  it('returns true and installs a second-instance handler when the lock is acquired', () => {
    const mockApp = createMockApp(true);
    const result = enforceSingleInstanceLock(mockApp, () => undefined);

    expect(result).toBe(true);
    expect(mockApp.quit).not.toHaveBeenCalled();
  });

  it('restores and focuses the existing window on a second-instance event', () => {
    const mockApp = createMockApp(true);
    const restore = vi.fn();
    const focus = vi.fn();
    const existingWindow = {
      isMinimized: () => true,
      restore,
      focus,
    } as unknown as BrowserWindow;

    enforceSingleInstanceLock(mockApp, () => existingWindow);
    (mockApp as unknown as { __emit: (e: string) => void }).__emit('second-instance');

    expect(restore).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
  });

  it('does nothing on second-instance when there is no existing window', () => {
    const mockApp = createMockApp(true);
    enforceSingleInstanceLock(mockApp, () => undefined);

    expect(() =>
      (mockApp as unknown as { __emit: (e: string) => void }).__emit('second-instance'),
    ).not.toThrow();
  });
});
