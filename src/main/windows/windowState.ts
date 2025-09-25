import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { BrowserWindow } from 'electron';
import { screen } from 'electron';

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 800;

function statePath(userDataPath: string, key: string): string {
  return join(userDataPath, 'window-state', `${key}.json`);
}

export function loadWindowBounds(userDataPath: string, key: string): WindowBounds | undefined {
  try {
    const raw = readFileSync(statePath(userDataPath, key), 'utf8');
    const parsed = JSON.parse(raw) as Partial<WindowBounds>;
    if (
      typeof parsed.x === 'number' &&
      typeof parsed.y === 'number' &&
      typeof parsed.width === 'number' &&
      typeof parsed.height === 'number'
    ) {
      return {
        x: parsed.x,
        y: parsed.y,
        width: parsed.width,
        height: parsed.height,
        isMaximized: Boolean(parsed.isMaximized),
      };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function saveWindowBounds(userDataPath: string, key: string, bounds: WindowBounds): void {
  const path = statePath(userDataPath, key);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(bounds), 'utf8');
}

/**
 * Resolves the bounds to open a window with: the last persisted bounds if
 * they still fit within a currently connected display's work area, or a
 * centered default sized to the primary display's work area otherwise.
 */
export function resolveInitialBounds(userDataPath: string, key: string): WindowBounds {
  const saved = loadWindowBounds(userDataPath, key);

  if (saved) {
    const fitsADisplay = screen
      .getAllDisplays()
      .some(
        (display) =>
          saved.x >= display.workArea.x &&
          saved.y >= display.workArea.y &&
          saved.x + saved.width <= display.workArea.x + display.workArea.width &&
          saved.y + saved.height <= display.workArea.y + display.workArea.height,
      );

    if (fitsADisplay) {
      return saved;
    }
  }

  const { workArea } = screen.getPrimaryDisplay();
  const width = Math.min(DEFAULT_WIDTH, workArea.width);
  const height = Math.min(DEFAULT_HEIGHT, workArea.height);

  return {
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height,
    isMaximized: false,
  };
}

/**
 * Wires `move`/`resize` (debounced via `close`) persistence for `window`,
 * writing its position, size, and maximized state under `key` so the next
 * launch can restore it. Returns a disposer that clears the pending debounce
 * timer and removes both listeners — callers should run it when the window
 * closes so no orphaned timer fires against a destroyed `webContents`.
 */
export function persistWindowBounds(
  window: BrowserWindow,
  userDataPath: string,
  key: string,
): () => void {
  const persist = (): void => {
    if (window.isDestroyed()) return;
    const isMaximized = window.isMaximized();
    const bounds = isMaximized ? window.getNormalBounds() : window.getBounds();
    saveWindowBounds(userDataPath, key, { ...bounds, isMaximized });
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const debouncedPersist = (): void => {
    clearTimeout(timer);
    timer = setTimeout(persist, 250);
  };

  window.on('move', debouncedPersist);
  window.on('resize', debouncedPersist);
  window.on('close', persist);

  return () => {
    clearTimeout(timer);
    window.removeListener('move', debouncedPersist);
    window.removeListener('resize', debouncedPersist);
    window.removeListener('close', persist);
  };
}
