export type CleanupAction = () => void;

/**
 * Coordinates every cleanup action a run's components need performed the
 * moment that run is aborted: killing spawned child processes,
 * terminating the model stream (already handled by passing the same
 * `AbortSignal` into `streamText`/tool execution), and resolving pending consent
 * requests as declined rather than leaving them hanging forever. Actions
 * run at most once, in registration order, and a later action throwing
 * never prevents an earlier or later one from running.
 *
 * Deliberately does *not* touch anything already written to disk:
 * `write_file`/`edit_file`/`rewrite_file` complete atomically and
 * irreversibly before their promise resolves, so a file modification
 * that already finished is never part of this cleanup and is preserved
 * exactly as-is.
 */
export class AbortCleanupCoordinator {
  private actions: CleanupAction[] = [];
  private triggered = false;

  constructor(signal: AbortSignal) {
    if (signal.aborted) {
      this.triggered = true;
    } else {
      signal.addEventListener('abort', () => this.runCleanup(), { once: true });
    }
  }

  get isTriggered(): boolean {
    return this.triggered;
  }

  /**
   * Registers `action` to run once, when the run's signal aborts. If the
   * signal has already aborted, `action` runs immediately, synchronously.
   * Returns an unregister function that removes `action` if it has not
   * run yet — used once whatever `action` was guarding (e.g. a tool call)
   * completes normally.
   */
  onAbort(action: CleanupAction): () => void {
    if (this.triggered) {
      action();
      return () => {};
    }

    this.actions.push(action);
    return () => {
      const index = this.actions.indexOf(action);
      if (index !== -1) this.actions.splice(index, 1);
    };
  }

  private runCleanup(): void {
    if (this.triggered) return;
    this.triggered = true;

    const pending = this.actions;
    this.actions = [];
    for (const action of pending) {
      try {
        action();
      } catch {
        // A single cleanup action failing must never prevent the rest —
        // and never surface as an unhandled rejection — from running.
      }
    }
  }
}

/**
 * Tracks pending decision resolvers by id (e.g. one per outstanding
 * consent request) so they can all be resolved at once with a single
 * fallback value — declined, on abort — instead of hanging forever
 * waiting on a user who will never see the prompt again.
 */
export class PendingDecisionRegistry<T> {
  private readonly resolvers = new Map<string, (value: T) => void>();

  register(id: string, resolve: (value: T) => void): () => void {
    this.resolvers.set(id, resolve);
    return () => {
      this.resolvers.delete(id);
    };
  }

  resolve(id: string, value: T): boolean {
    const resolveFn = this.resolvers.get(id);
    if (!resolveFn) return false;
    this.resolvers.delete(id);
    resolveFn(value);
    return true;
  }

  /** Resolves every still-pending decision with `value`, in no particular order, then clears the registry. */
  resolveAll(value: T): void {
    const pending = [...this.resolvers.values()];
    this.resolvers.clear();
    for (const resolveFn of pending) {
      resolveFn(value);
    }
  }

  get pendingCount(): number {
    return this.resolvers.size;
  }
}
