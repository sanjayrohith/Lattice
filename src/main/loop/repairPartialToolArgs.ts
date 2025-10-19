import { jsonrepair } from 'jsonrepair';

/**
 * Attempts to parse `partial` — potentially incomplete JSON, as it looks
 * mid-stream before the model has finished emitting a tool call's
 * arguments — by repairing it first (closing unterminated strings,
 * objects, and arrays; dropping a dangling trailing key) and then
 * parsing the result. Returns `undefined` for input too malformed even
 * for `jsonrepair` to make sense of, e.g. an empty string, rather than
 * throwing.
 */
export function repairPartialJson(partial: string): unknown | undefined {
  if (partial.trim().length === 0) return undefined;

  try {
    return JSON.parse(jsonrepair(partial));
  } catch {
    return undefined;
  }
}

/**
 * Accumulates a tool call's `tool-input-delta` chunks as they stream in
 * and re-derives a best-effort, progressively more complete parsed
 * object on every chunk — the partial argument preview the UI renders
 * live (`feat(ui): render live tool call previews`) before the call is
 * complete enough to actually dispatch.
 */
export class PartialToolArgsTracker {
  private buffer = '';

  /** Appends `delta` and returns the best current parse of the accumulated buffer so far. */
  append(delta: string): unknown | undefined {
    this.buffer += delta;
    return repairPartialJson(this.buffer);
  }

  get raw(): string {
    return this.buffer;
  }

  reset(): void {
    this.buffer = '';
  }
}
