/**
 * Tracks the `AbortController` backing each in-flight run, keyed by run
 * id. The same controller's `signal` is passed to both the model stream
 * call and every tool execution for that run, so a single `cancel` call
 * tears down everything the run is currently doing.
 */
export class RunAbortRegistry {
  private readonly controllers = new Map<string, AbortController>();

  /** Creates and tracks a fresh `AbortController` for `runId`, replacing any prior one for the same id. */
  create(runId: string): AbortController {
    const controller = new AbortController();
    this.controllers.set(runId, controller);
    return controller;
  }

  get(runId: string): AbortController | undefined {
    return this.controllers.get(runId);
  }

  /** Aborts the run's controller, if tracked. Returns whether a controller was found and aborted. */
  cancel(runId: string): boolean {
    const controller = this.controllers.get(runId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  /** Stops tracking `runId`'s controller, once the run has reached a terminal state. */
  dispose(runId: string): void {
    this.controllers.delete(runId);
  }
}
