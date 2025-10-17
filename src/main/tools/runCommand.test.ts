import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCommandTool } from './runCommand';

const node = process.execPath;

describe('runCommandTool', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'lattice-run-command-test-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  function parse(input: Record<string, unknown>) {
    return runCommandTool.inputSchema.parse(input);
  }

  it('captures stdout and a zero exit code on success', async () => {
    const result = await runCommandTool.execute(
      parse({ command: node, args: ['-e', "process.stdout.write('hello')"] }),
      { workspaceRoot },
    );

    expect(result.stdout).toBe('hello');
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it('captures stderr and a non-zero exit code on failure', async () => {
    const result = await runCommandTool.execute(
      parse({
        command: node,
        args: ['-e', "process.stderr.write('boom'); process.exit(2)"],
      }),
      { workspaceRoot },
    );

    expect(result.stderr).toBe('boom');
    expect(result.exitCode).toBe(2);
  });

  it('runs the command with the workspace root as its cwd', async () => {
    const result = await runCommandTool.execute(
      parse({ command: node, args: ['-e', 'process.stdout.write(process.cwd())'] }),
      { workspaceRoot },
    );

    expect(result.stdout).toBe(workspaceRoot);
  });

  it('streams output chunks to onOutput as they arrive', async () => {
    const chunks: Array<{ stream: string; text: string }> = [];

    await runCommandTool.execute(parse({ command: node, args: ['-e', "process.stdout.write('x')"] }), {
      workspaceRoot,
      onOutput: (chunk) => chunks.push(chunk),
    });

    expect(chunks).toEqual([{ stream: 'stdout', text: 'x' }]);
  });

  it('kills the process and reports timedOut after exceeding timeoutMs', async () => {
    const result = await runCommandTool.execute(
      parse({
        command: node,
        args: ['-e', 'setTimeout(() => {}, 5000)'],
        timeoutMs: 200,
      }),
      { workspaceRoot },
    );

    expect(result.timedOut).toBe(true);
  }, 10_000);

  it('truncates output beyond maxOutputBytes and reports truncated: true', async () => {
    const result = await runCommandTool.execute(
      parse({
        command: node,
        args: ['-e', "process.stdout.write('a'.repeat(1000))"],
        maxOutputBytes: 100,
      }),
      { workspaceRoot },
    );

    expect(result.stdout.length).toBeLessThanOrEqual(100);
    expect(result.truncated).toBe(true);
  });

  it('does not truncate output under the cap', async () => {
    const result = await runCommandTool.execute(
      parse({ command: node, args: ['-e', "process.stdout.write('small')"], maxOutputBytes: 100 }),
      { workspaceRoot },
    );

    expect(result.truncated).toBe(false);
  });

  it('requires consent since it executes arbitrary commands', () => {
    expect(runCommandTool.defaultConsent).toBe('ask');
  });
});
