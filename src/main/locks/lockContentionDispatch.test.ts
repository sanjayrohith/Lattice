import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dispatchToolCall } from '../loop/toolDispatch';
import { ToolRegistry } from '../tools/registry';
import { writeFileTool } from '../tools/writeFile';
import { LockManager } from './lockManager';

/**
 * Confirms the full path an agent actually sees: a lock held by
 * another agent surfaces through `dispatchToolCall`'s generic error
 * normalization as a structured `ToolCallFailure` with the
 * `LOCK_ALREADY_HELD` code and a message naming the holder plus
 * actionable next steps — not a raw thrown exception, and not a
 * generic "tool execution error" that loses the specifics.
 */
describe('lock contention surfaced through dispatchToolCall', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'lattice-lock-contention-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('returns a structured failure naming the holder and offering queue/switch/wait instructions', async () => {
    const registry = new ToolRegistry();
    registry.register(writeFileTool);

    const locks = new LockManager();
    locks.acquire(join(workspaceRoot, 'a.txt'), { runId: 'run-holder', agentId: 'reviewer' });

    const result = await dispatchToolCall(
      { toolCallId: 'tc-1', toolName: 'write_file', input: { path: 'a.txt', content: 'x' } },
      registry,
      { workspaceRoot, locks, lockOwner: { runId: 'run-2', agentId: 'coder' } },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LOCK_ALREADY_HELD');
      expect(result.error.message).toContain('reviewer');
      expect(result.error.message).toContain('run-holder');
      expect(result.error.message).toContain('Queue this edit');
      expect(result.error.message).toContain('switch to a');
      expect(result.error.message).toContain('wait and retry');
    }
  });
});
