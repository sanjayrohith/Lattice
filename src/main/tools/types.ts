import type { z } from 'zod';

/**
 * How a tool call is authorized before it runs:
 *
 * - `always` — safe, read-only operations execute without prompting.
 * - `ask` — the run suspends at the consent gate until the user decides.
 * - `never` — the call is refused unconditionally, before the gate even runs.
 */
export type ConsentPolicy = 'always' | 'ask' | 'never';

/** Per-call context a tool's `execute` needs but that is never part of the model-visible input. */
export interface ToolExecutionContext {
  /** The sandboxed root directory every filesystem-touching tool must resolve paths against. */
  workspaceRoot: string;
  /** Aborts long-running work (e.g. `run_command`) when the owning run is cancelled. */
  signal?: AbortSignal;
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
