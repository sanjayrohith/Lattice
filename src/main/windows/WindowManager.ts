import type { BrowserWindow } from 'electron';

export type WindowRole = 'main' | 'popout';

interface WindowEntry {
  id: number;
  role: WindowRole;
  window: BrowserWindow;
}

/**
 * Tracks every live `BrowserWindow` by numeric id and logical role,
 * exposing lookup and broadcast helpers. Entries are evicted automatically
 * when their window fires `closed`, so the registry never holds a
 * reference to a destroyed `webContents`.
 */
export class WindowManager {
  private readonly entries = new Map<number, WindowEntry>();

  register(window: BrowserWindow, role: WindowRole): void {
    const id = window.id;
    this.entries.set(id, { id, role, window });

    window.once('closed', () => {
      this.entries.delete(id);
    });
  }

  get(id: number): BrowserWindow | undefined {
    return this.entries.get(id)?.window;
  }

  getByRole(role: WindowRole): BrowserWindow[] {
    return [...this.entries.values()]
      .filter((entry) => entry.role === role)
      .map((entry) => entry.window);
  }

  getAll(): BrowserWindow[] {
    return [...this.entries.values()].map((entry) => entry.window);
  }

  count(): number {
    return this.entries.size;
  }

  /** Sends `channel`/`payload` to every tracked window whose webContents is still alive. */
  broadcast(channel: string, payload: unknown): void {
    for (const entry of this.entries.values()) {
      if (!entry.window.isDestroyed()) {
        entry.window.webContents.send(channel, payload);
      }
    }
  }
}

/** Process-wide singleton; the app only ever needs one registry. */
export const windowManager = new WindowManager();
