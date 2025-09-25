import type { BrowserWindow } from 'electron';

export type WindowRole = 'main' | 'popout';

export type Disposer = () => void;

interface WindowEntry {
  id: number;
  role: WindowRole;
  window: BrowserWindow;
  disposers: Set<Disposer>;
}

/**
 * Tracks every live `BrowserWindow` by numeric id and logical role,
 * exposing lookup and broadcast helpers. Entries are evicted automatically
 * when their window fires `closed`, so the registry never holds a
 * reference to a destroyed `webContents`.
 *
 * Callers may also attach arbitrary teardown callbacks (IPC subscription
 * unsubscribes, `clearInterval`/`clearTimeout`, stream cancellations) via
 * `onClose`; every one is run before the entry is evicted, so a window that
 * closes mid-stream never leaves a dangling listener or timer behind.
 */
export class WindowManager {
  private readonly entries = new Map<number, WindowEntry>();

  register(window: BrowserWindow, role: WindowRole): void {
    const id = window.id;
    const disposers = new Set<Disposer>();
    this.entries.set(id, { id, role, window, disposers });

    window.once('closed', () => {
      for (const dispose of disposers) {
        try {
          dispose();
        } catch {
          // A misbehaving disposer must never block the rest of teardown.
        }
      }
      disposers.clear();
      this.entries.delete(id);
    });
  }

  /**
   * Registers `dispose` to run when the window identified by `windowId`
   * closes. Returns a function that removes the disposer early, in case the
   * subscription it guards is torn down for some other reason first.
   */
  onClose(windowId: number, dispose: Disposer): Disposer {
    const entry = this.entries.get(windowId);
    if (!entry) {
      return () => {};
    }
    entry.disposers.add(dispose);
    return () => {
      entry.disposers.delete(dispose);
    };
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
