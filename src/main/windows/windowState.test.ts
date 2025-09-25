import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const primaryWorkArea = { x: 0, y: 0, width: 1920, height: 1080 };

vi.mock('electron', () => ({
  screen: {
    getAllDisplays: () => [{ workArea: primaryWorkArea }],
    getPrimaryDisplay: () => ({ workArea: primaryWorkArea }),
  },
}));

let userDataPath: string;

beforeEach(() => {
  userDataPath = mkdtempSync(join(tmpdir(), 'lattice-window-state-'));
});

afterEach(() => {
  rmSync(userDataPath, { recursive: true, force: true });
});

describe('windowState', () => {
  it('returns a centered default when nothing has been persisted yet', async () => {
    const { resolveInitialBounds } = await import('./windowState');
    const bounds = resolveInitialBounds(userDataPath, 'main');

    expect(bounds.isMaximized).toBe(false);
    expect(bounds.width).toBeLessThanOrEqual(primaryWorkArea.width);
    expect(bounds.height).toBeLessThanOrEqual(primaryWorkArea.height);
  });

  it('round-trips saved bounds through resolveInitialBounds when they still fit a display', async () => {
    const { saveWindowBounds, resolveInitialBounds } = await import('./windowState');

    saveWindowBounds(userDataPath, 'main', {
      x: 100,
      y: 100,
      width: 1000,
      height: 700,
      isMaximized: false,
    });

    const bounds = resolveInitialBounds(userDataPath, 'main');
    expect(bounds).toEqual({ x: 100, y: 100, width: 1000, height: 700, isMaximized: false });
  });

  it('falls back to the primary display default when saved bounds no longer fit any display', async () => {
    const { saveWindowBounds, resolveInitialBounds } = await import('./windowState');

    saveWindowBounds(userDataPath, 'main', {
      x: 5000,
      y: 5000,
      width: 1000,
      height: 700,
      isMaximized: false,
    });

    const bounds = resolveInitialBounds(userDataPath, 'main');
    expect(bounds.x).toBeLessThan(5000);
  });

  it('returns undefined from loadWindowBounds when no state file exists', async () => {
    const { loadWindowBounds } = await import('./windowState');
    expect(loadWindowBounds(userDataPath, 'never-saved')).toBeUndefined();
  });

  it('persistWindowBounds returns a disposer that removes its listeners', async () => {
    const { persistWindowBounds } = await import('./windowState');
    const { EventEmitter } = await import('node:events');

    const emitter = new EventEmitter();
    const mockWindow = Object.assign(emitter, {
      isDestroyed: () => false,
      isMaximized: () => false,
      getBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
      getNormalBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
    });

    const dispose = persistWindowBounds(mockWindow as never, userDataPath, 'main');
    expect(emitter.listenerCount('move')).toBeGreaterThan(0);
    expect(emitter.listenerCount('resize')).toBeGreaterThan(0);
    expect(emitter.listenerCount('close')).toBeGreaterThan(0);

    dispose();

    expect(emitter.listenerCount('move')).toBe(0);
    expect(emitter.listenerCount('resize')).toBe(0);
    expect(emitter.listenerCount('close')).toBe(0);
  });
});
