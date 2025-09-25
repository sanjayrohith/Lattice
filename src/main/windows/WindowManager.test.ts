import { describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import { WindowManager } from './WindowManager';

let nextId = 1;

function createMockWindow(): BrowserWindow & { __emitClosed: () => void } {
  const listeners = new Map<string, () => void>();
  const id = nextId++;
  return {
    id,
    isDestroyed: () => false,
    webContents: { send: vi.fn() },
    once: (event: string, listener: () => void) => {
      listeners.set(event, listener);
    },
    __emitClosed: () => listeners.get('closed')?.(),
  } as unknown as BrowserWindow & { __emitClosed: () => void };
}

describe('WindowManager', () => {
  it('registers a window and finds it by id', () => {
    const manager = new WindowManager();
    const window = createMockWindow();

    manager.register(window, 'main');
    expect(manager.get(window.id)).toBe(window);
  });

  it('lists windows filtered by role', () => {
    const manager = new WindowManager();
    const main = createMockWindow();
    const popout = createMockWindow();

    manager.register(main, 'main');
    manager.register(popout, 'popout');

    expect(manager.getByRole('main')).toEqual([main]);
    expect(manager.getByRole('popout')).toEqual([popout]);
  });

  it('evicts an entry when its window fires closed', () => {
    const manager = new WindowManager();
    const window = createMockWindow();

    manager.register(window, 'main');
    expect(manager.count()).toBe(1);

    window.__emitClosed();
    expect(manager.count()).toBe(0);
    expect(manager.get(window.id)).toBeUndefined();
  });

  it('broadcasts a channel and payload to every live window', () => {
    const manager = new WindowManager();
    const a = createMockWindow();
    const b = createMockWindow();
    manager.register(a, 'main');
    manager.register(b, 'popout');

    manager.broadcast('state:revision', { revision: 1 });

    expect(a.webContents.send).toHaveBeenCalledWith('state:revision', { revision: 1 });
    expect(b.webContents.send).toHaveBeenCalledWith('state:revision', { revision: 1 });
  });

  it('runs every registered disposer when the window closes', () => {
    const manager = new WindowManager();
    const window = createMockWindow();
    manager.register(window, 'main');

    const disposeA = vi.fn();
    const disposeB = vi.fn();
    manager.onClose(window.id, disposeA);
    manager.onClose(window.id, disposeB);

    window.__emitClosed();

    expect(disposeA).toHaveBeenCalledOnce();
    expect(disposeB).toHaveBeenCalledOnce();
  });

  it('does not run a disposer that was removed before close', () => {
    const manager = new WindowManager();
    const window = createMockWindow();
    manager.register(window, 'main');

    const dispose = vi.fn();
    const remove = manager.onClose(window.id, dispose);
    remove();

    window.__emitClosed();
    expect(dispose).not.toHaveBeenCalled();
  });

  it('continues running remaining disposers even if one throws', () => {
    const manager = new WindowManager();
    const window = createMockWindow();
    manager.register(window, 'main');

    const throwing = vi.fn(() => {
      throw new Error('boom');
    });
    const after = vi.fn();
    manager.onClose(window.id, throwing);
    manager.onClose(window.id, after);

    expect(() => window.__emitClosed()).not.toThrow();
    expect(after).toHaveBeenCalledOnce();
  });

  it('returns a no-op remover when registering a disposer for an unknown window', () => {
    const manager = new WindowManager();
    expect(() => manager.onClose(9999, vi.fn())()).not.toThrow();
  });

  it('skips a destroyed window during broadcast', () => {
    const manager = new WindowManager();
    const destroyed = createMockWindow();
    (destroyed as unknown as { isDestroyed: () => boolean }).isDestroyed = () => true;
    manager.register(destroyed, 'main');

    manager.broadcast('state:revision', { revision: 1 });

    expect(destroyed.webContents.send).not.toHaveBeenCalled();
  });
});
