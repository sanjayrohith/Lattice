import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App, BrowserWindow } from 'electron';
import { registerLifecycleHandlers } from './lifecycle';

function createMockApp(): App & { __emit: (event: string) => void } {
  const listeners = new Map<string, () => void>();
  return {
    on: (event: string, listener: () => void) => {
      listeners.set(event, listener);
    },
    quit: vi.fn(),
    __emit: (event: string) => listeners.get(event)?.(),
  } as unknown as App & { __emit: (event: string) => void };
}

const originalPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform });
}

afterEach(() => {
  setPlatform(originalPlatform);
});

describe('registerLifecycleHandlers', () => {
  it('quits on window-all-closed for non-macOS platforms', () => {
    setPlatform('win32');
    const mockApp = createMockApp();
    registerLifecycleHandlers(mockApp, { createWindow: vi.fn(), getAllWindows: () => [] });

    mockApp.__emit('window-all-closed');
    expect(mockApp.quit).toHaveBeenCalledOnce();
  });

  it('does not quit on window-all-closed on macOS', () => {
    setPlatform('darwin');
    const mockApp = createMockApp();
    registerLifecycleHandlers(mockApp, { createWindow: vi.fn(), getAllWindows: () => [] });

    mockApp.__emit('window-all-closed');
    expect(mockApp.quit).not.toHaveBeenCalled();
  });

  it('creates a new window on activate when none are open', () => {
    const mockApp = createMockApp();
    const createWindow = vi.fn();
    registerLifecycleHandlers(mockApp, { createWindow, getAllWindows: () => [] });

    mockApp.__emit('activate');
    expect(createWindow).toHaveBeenCalledOnce();
  });

  it('does not create a new window on activate when one is already open', () => {
    const mockApp = createMockApp();
    const createWindow = vi.fn();
    registerLifecycleHandlers(mockApp, {
      createWindow,
      getAllWindows: () => [{} as BrowserWindow],
    });

    mockApp.__emit('activate');
    expect(createWindow).not.toHaveBeenCalled();
  });

  it('invokes the before-quit hook regardless of platform', () => {
    const mockApp = createMockApp();
    const onBeforeQuit = vi.fn();
    registerLifecycleHandlers(mockApp, { createWindow: vi.fn(), getAllWindows: () => [] }, onBeforeQuit);

    mockApp.__emit('before-quit');
    expect(onBeforeQuit).toHaveBeenCalledOnce();
  });
});
