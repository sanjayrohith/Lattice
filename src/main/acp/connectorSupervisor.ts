export type ConnectorHealthState = 'starting' | 'running' | 'restarting' | 'unavailable' | 'stopped';

export interface ConnectorHealth {
  connectorId: string;
  state: ConnectorHealthState;
  consecutiveFailures: number;
  lastError?: string;
}

export interface ConnectorSupervisorOptions {
  /** Spawns the connector process/connection; rejects or throws on failure to start. */
  start: () => Promise<void>;
  /** Total consecutive failures tolerated before the connector is marked `unavailable` and given up on; defaults to 5. */
  maxConsecutiveFailures?: number;
  /** Base delay for the capped exponential restart backoff, in milliseconds; defaults to 500. */
  baseDelayMs?: number;
  /** Upper bound on the computed restart delay, in milliseconds; defaults to 30000. */
  maxDelayMs?: number;
  /** Injectable sleep implementation so tests can run without real timers. */
  sleep?: (ms: number) => Promise<void>;
}

function backoffDelayMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  return Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
}

/**
 * Supervises one ACP connector's process lifecycle: starts it, and on
 * an unexpected crash (`notifyCrashed`), restarts it with capped
 * exponential backoff. After {@link ConnectorSupervisorOptions.maxConsecutiveFailures}
 * consecutive failed restart attempts the connector is marked
 * `unavailable` and no further automatic restart is attempted — a
 * connector in that state only recovers via an explicit
 * {@link ConnectorSupervisor.reset} (e.g. the user re-enabling it from
 * the settings panel).
 */
export class ConnectorSupervisor {
  private health: ConnectorHealth;
  private restarting = false;

  constructor(
    private readonly connectorId: string,
    private readonly options: ConnectorSupervisorOptions,
  ) {
    this.health = { connectorId, state: 'starting', consecutiveFailures: 0 };
  }

  getHealth(): ConnectorHealth {
    return { ...this.health };
  }

  private get maxFailures(): number {
    return this.options.maxConsecutiveFailures ?? 5;
  }

  private sleep(ms: number): Promise<void> {
    return (this.options.sleep ?? ((delay: number) => new Promise((resolve) => setTimeout(resolve, delay))))(ms);
  }

  /** Starts the connector for the first time. */
  async start(): Promise<void> {
    this.health = { connectorId: this.connectorId, state: 'starting', consecutiveFailures: 0 };
    try {
      await this.options.start();
      this.health = { ...this.health, state: 'running', consecutiveFailures: 0 };
    } catch (error) {
      this.health = {
        ...this.health,
        state: 'unavailable',
        consecutiveFailures: 1,
        lastError: errorMessage(error),
      };
      throw error;
    }
  }

  /**
   * Called when the connector's process has died unexpectedly (not via
   * `stop()`). Attempts a capped-exponential-backoff restart, unless
   * the failure count already exceeds the tolerance, in which case the
   * connector is marked `unavailable` without attempting to restart.
   */
  async notifyCrashed(error?: unknown): Promise<void> {
    if (this.restarting || this.health.state === 'stopped') return;
    this.restarting = true;

    try {
      let lastError = error;
      while (true) {
        const failures = this.health.consecutiveFailures + 1;
        this.health = {
          ...this.health,
          state: 'restarting',
          consecutiveFailures: failures,
          lastError: lastError ? errorMessage(lastError) : this.health.lastError,
        };

        if (failures > this.maxFailures) {
          this.health = { ...this.health, state: 'unavailable' };
          return;
        }

        await this.sleep(
          backoffDelayMs(failures, this.options.baseDelayMs ?? 500, this.options.maxDelayMs ?? 30_000),
        );

        try {
          await this.options.start();
          this.health = { ...this.health, state: 'running', consecutiveFailures: 0, lastError: undefined };
          return;
        } catch (restartError) {
          lastError = restartError;
          // loop again: another attempt, incrementing the failure count.
        }
      }
    } finally {
      this.restarting = false;
    }
  }

  /** Marks the connector as intentionally stopped, no further automatic restarts. */
  stop(): void {
    this.health = { ...this.health, state: 'stopped' };
  }

  /** Clears failure tracking and returns the connector to `starting`, allowing restarts again. */
  reset(): void {
    this.health = { connectorId: this.connectorId, state: 'starting', consecutiveFailures: 0 };
    this.restarting = false;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
