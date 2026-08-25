import type { z } from 'zod';
import type { ToolOutcomeRepository } from '../db/repositories/toolOutcomeRepository';
import type { LockManager, LockOwner } from '../locks/lockManager';
import type { SeenRangeTracker } from '../memory/seenRangeTracker';

/**
 * How a tool call is authorized before it runs:
 *
 * - `always` — safe, read-only operations execute without prompting.
 * - `ask` — the run suspends at the consent gate until the user decides.
 * - `never` — the call is refused unconditionally, before the gate even runs.
 */
export type ConsentPolicy = 'always' | 'ask' | 'never';

/** One incremental chunk of a long-running tool's output, as it becomes available. */
export interface ToolOutputChunk {
  stream: 'stdout' | 'stderr';
  text: string;
}

/** Per-call context a tool's `execute` needs but that is never part of the model-visible input. */
export interface ToolExecutionContext {
  /** The sandboxed root directory every filesystem-touching tool must resolve paths against. */
  workspaceRoot: string;
  /** Aborts long-running work (e.g. `run_command`) when the owning run is cancelled. */
  signal?: AbortSignal;
  /** Called with each incremental chunk a streaming tool (e.g. `run_command`) produces, in order. */
  onOutput?: (chunk: ToolOutputChunk) => void;
  /**
   * The centralized lock manager write-capable tools must acquire an
   * exclusive lock through before touching disk. Omitted entirely in
   * contexts that never run write-capable tools concurrently (e.g.
   * most unit tests), in which case those tools skip locking rather
   * than failing on a manager they were never given.
   */
  locks?: LockManager;
  /** The run and agent identity to acquire locks under; required whenever `locks` is provided. */
  lockOwner?: LockOwner;
  /**
   * Records which file/line ranges the run has already placed in front of
   * the model, so per-turn memory retrieval (`injectRetrievedContext`)
   * never spends the token budget re-injecting content a tool already
   * surfaced. Omitted in contexts with no memory subsystem wired up (e.g.
   * most unit tests), in which case content-bearing tools skip tracking.
   */
  seenRanges?: SeenRangeTracker;
  /**
   * Records each edit-strategy tool's success/failure per file type, so
   * `selectEditStrategy` can bias future runs toward whichever of
   * `edit_file`/`rewrite_file` has actually proven reliable for a given
   * extension. Omitted in contexts with no telemetry store wired up
   * (e.g. most unit tests), in which case those tools skip recording.
   */
  toolOutcomes?: ToolOutcomeRepository;
}

/**
 * The contract every local tool implements: a Zod-validated input schema
 * the model's arguments are parsed against, a default consent policy, and
 * an async `execute` that performs the actual work. `Tool` is deliberately
 * generic over its input type so a concrete tool's `execute` receives a
 * fully-typed, already-validated argument object rather than `unknown`.
 */
export interface Tool<Input = unknown, Output = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<Input>;
  defaultConsent: ConsentPolicy;
  execute: (input: Input, context: ToolExecutionContext) => Promise<Output>;
}

/**
 * Identity helper that lets a tool definition's `Input`/`Output` generics
 * be inferred from `inputSchema` and `execute` at the call site, instead
 * of every tool module having to spell out `Tool<Foo, Bar>` explicitly.
 */
export function defineTool<Input, Output>(tool: Tool<Input, Output>): Tool<Input, Output> {
  return tool;
}

/**
 * A type-erased tool as held by the registry and the agent loop, which
 * dispatch on a runtime-validated `name` rather than a statically known
 * `Input`/`Output`. Every concrete tool is still authored against the
 * fully generic {@link Tool} via {@link defineTool}; this alias exists
 * only at the heterogeneous-collection boundary.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
export type AnyTool = Tool<any, any>;
