/** The default hard cap on agent-loop iterations per run, absent an explicit override from settings. */
export const DEFAULT_STEP_CAP = 25;

/** Thrown when a run would exceed its step cap; the run terminates with this as its failure reason. */
export class StepCapReachedError extends Error {
  readonly code = 'STEP_CAP_REACHED';

  constructor(public readonly cap: number) {
    super(`step cap of ${cap} reached; terminating run`);
    this.name = 'StepCapReachedError';
  }
}

/**
 * Counts the steps taken by one agent run and enforces its cap. `next()`
 * is called once per loop iteration, immediately before that iteration's
 * model call; it throws {@link StepCapReachedError} instead of returning
 * a step number once the cap would be exceeded, so the loop cannot run
 * indefinitely regardless of what the model keeps requesting.
 */
export class StepCapTracker {
  private steps = 0;

  constructor(private readonly cap: number = DEFAULT_STEP_CAP) {
    if (cap < 1) {
      throw new RangeError(`step cap must be at least 1, got ${cap}`);
    }
  }

  get current(): number {
    return this.steps;
  }

  get isReached(): boolean {
    return this.steps >= this.cap;
  }

  /** Advances to the next step, returning its 1-indexed step number, or throws once the cap is reached. */
  next(): number {
    if (this.isReached) {
      throw new StepCapReachedError(this.cap);
    }
    this.steps += 1;
    return this.steps;
  }
}
