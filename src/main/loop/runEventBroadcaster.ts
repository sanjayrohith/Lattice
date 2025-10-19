import type { RunStreamEvent } from '@shared/ipc/events';

type DiscreteRunStreamEvent = Exclude<RunStreamEvent, { type: 'text-delta' | 'partial-tool-args' }>;

/**
 * Buffers run stream events and flushes a single coalesced batch on a
 * fixed interval, rather than sending one IPC message per token or
 * per streamed tool-argument chunk:
 *
 * - `text-delta` chunks for the same run are concatenated into one delta.
 * - `partial-tool-args` keeps only the latest parse per tool call — a
 *   renderer only ever needs to render the most complete preview.
 * - `tool-start`, `tool-result`, and `state-change` are discrete
 *   milestones, kept individually, in the order they occurred.
 *
 * This keeps the renderer responsive under heavy streaming: no matter
 * how many deltas the model emits between flushes, at most one IPC
 * message per `intervalMs` reaches the UI.
 */
export class RunEventBroadcaster {
  private textDeltaByRun = new Map<string, string>();
  private partialToolArgsByRun = new Map<string, Map<string, RunStreamEvent & { type: 'partial-tool-args' }>>();
  private discreteEvents: DiscreteRunStreamEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly intervalMs: number,
    private readonly send: (batch: RunStreamEvent[]) => void,
  ) {}

  emit(event: RunStreamEvent): void {
    switch (event.type) {
      case 'text-delta': {
        const existing = this.textDeltaByRun.get(event.runId) ?? '';
        this.textDeltaByRun.set(event.runId, existing + event.delta);
        break;
      }
      case 'partial-tool-args': {
        const perRun = this.partialToolArgsByRun.get(event.runId) ?? new Map();
        perRun.set(event.toolCallId, event);
        this.partialToolArgsByRun.set(event.runId, perRun);
        break;
      }
      default:
        this.discreteEvents.push(event);
    }

    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), this.intervalMs);
  }

  /** Sends every currently buffered event as one batch, and clears the buffer. Safe to call with nothing pending. */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    const batch: RunStreamEvent[] = [];

    for (const [runId, delta] of this.textDeltaByRun) {
      if (delta.length > 0) {
        batch.push({ type: 'text-delta', runId, delta });
      }
    }
    this.textDeltaByRun.clear();

    for (const perRun of this.partialToolArgsByRun.values()) {
      for (const event of perRun.values()) {
        batch.push(event);
      }
    }
    this.partialToolArgsByRun.clear();

    batch.push(...this.discreteEvents);
    this.discreteEvents = [];

    if (batch.length > 0) {
      this.send(batch);
    }
  }

  /** Cancels a pending flush timer without sending. Call on shutdown to avoid a dangling timer. */
  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
