import { spawn } from 'node:child_process';
import { z } from 'zod';
import { defineTool } from './types';

export const runCommandInputSchema = z.object({
  command: z.string().min(1).describe('the executable to run'),
  args: z.array(z.string()).default([]).describe('arguments passed to the command'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(300_000)
    .default(30_000)
    .describe('the process is killed if it runs longer than this, in milliseconds'),
  maxOutputBytes: z
    .number()
    .int()
    .positive()
    .max(2_000_000)
    .default(200_000)
    .describe('cap on combined stdout and stderr bytes retained in the result'),
});

export interface RunCommandOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
}

/**
 * Runs a command as a child process rooted at the workspace, streaming
 * stdout and stderr to `context.onOutput` incrementally as they arrive
 * and buffering a capped copy for the final result. The process is
 * killed with `SIGKILL` if it exceeds `timeoutMs`, and output beyond
 * `maxOutputBytes` (combined across both streams) is dropped rather than
 * buffered without bound. Requires consent, since it executes arbitrary
 * commands.
 */
export const runCommandTool = defineTool({
  name: 'run_command',
  description: 'runs a shell command in the workspace, streaming its output incrementally',
  inputSchema: runCommandInputSchema,
  defaultConsent: 'ask',
  execute: (input, context): Promise<RunCommandOutput> => {
    return new Promise((resolvePromise, rejectPromise) => {
      const child = spawn(input.command, input.args, {
        cwd: context.workspaceRoot,
        signal: context.signal,
      });

      let stdout = '';
      let stderr = '';
      let bytesCaptured = 0;
      let truncated = false;
      let timedOut = false;
      let settled = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, input.timeoutMs);

      function capture(stream: 'stdout' | 'stderr', chunk: Buffer): void {
        const text = chunk.toString('utf-8');
        context.onOutput?.({ stream, text });

        if (bytesCaptured >= input.maxOutputBytes) {
          truncated = true;
          return;
        }

        const remaining = input.maxOutputBytes - bytesCaptured;
        const kept = text.length > remaining ? text.slice(0, remaining) : text;
        if (kept.length < text.length) truncated = true;
        bytesCaptured += kept.length;

        if (stream === 'stdout') stdout += kept;
        else stderr += kept;
      }

      child.stdout.on('data', (chunk: Buffer) => capture('stdout', chunk));
      child.stderr.on('data', (chunk: Buffer) => capture('stderr', chunk));

      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        rejectPromise(error);
      });

      child.on('close', (exitCode) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolvePromise({ stdout, stderr, exitCode, timedOut, truncated });
      });
    });
  },
});
