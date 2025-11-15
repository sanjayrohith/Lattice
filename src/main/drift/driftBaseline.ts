import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolveWorkspacePath } from '../tools/pathSandbox';

/**
 * A snapshot of one file at the moment a multi-agent run began
 * touching it: its full content, retained so a later "Revert" action
 * has something to actually restore to, and a content hash of that
 * same content, retained separately so a cheap equality check (hash
 * comparison) never has to re-hash on every detection pass.
 */
export interface FileSnapshot {
  path: string;
  content: string;
  contentHash: string;
}

/**
 * The drift baseline for one multi-agent run: the user's original
 * specification (what the run was actually asked to do) alongside a
 * content-hash snapshot of every file entering the run, captured
 * before any agent has a chance to touch them. Later divergence
 * detection compares in-progress file state against this baseline,
 * not against whatever the previous detection pass happened to see —
 * so drift is always measured relative to what was actually asked
 * for and what the files actually looked like at the start.
 */
export interface DriftBaseline {
  runId: string;
  specification: string;
  capturedAt: number;
  files: FileSnapshot[];
}

/** SHA-256 hex digest of `content`, the hash algorithm every snapshot in this module uses. */
export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Snapshots every file in `filePaths` (workspace-relative, sandboxed
 * against `workspaceRoot` exactly as any tool would) and pairs those
 * snapshots with `specification` to form the run's drift baseline. A
 * file that does not yet exist (a path the run is about to create)
 * is recorded with an empty-content hash rather than skipped, so a
 * later "it now exists" state is still a detectable, comparable
 * change from the baseline.
 */
export async function captureDriftBaseline(
  runId: string,
  specification: string,
  workspaceRoot: string,
  filePaths: readonly string[],
): Promise<DriftBaseline> {
  const files: FileSnapshot[] = [];

  for (const path of filePaths) {
    const resolvedPath = resolveWorkspacePath(workspaceRoot, path);
    const content = await readFile(resolvedPath, 'utf-8').catch(() => '');
    files.push({ path, content, contentHash: hashContent(content) });
  }

  return { runId, specification, capturedAt: Date.now(), files };
}

/**
 * Holds the drift baseline for every currently active multi-agent run,
 * keyed by run id. A run's baseline is captured once, at the start,
 * and then either consulted (divergence detection) or explicitly
 * updated (an operator accepting a drifted file rebases the baseline
 * to the new content, rather than continuing to flag it forever).
 */
export class DriftBaselineStore {
  private readonly baselinesByRunId = new Map<string, DriftBaseline>();

  set(baseline: DriftBaseline): void {
    this.baselinesByRunId.set(baseline.runId, baseline);
  }

  get(runId: string): DriftBaseline | undefined {
    return this.baselinesByRunId.get(runId);
  }

  /** Rebases one file's recorded snapshot in `runId`'s baseline, e.g. after an operator accepts a divergence. */
  updateFileSnapshot(runId: string, path: string, content: string): void {
    const baseline = this.baselinesByRunId.get(runId);
    if (!baseline) return;

    const snapshot: FileSnapshot = { path, content, contentHash: hashContent(content) };
    const existingIndex = baseline.files.findIndex((file) => file.path === path);
    if (existingIndex === -1) {
      baseline.files.push(snapshot);
      return;
    }
    baseline.files[existingIndex] = snapshot;
  }

  release(runId: string): void {
    this.baselinesByRunId.delete(runId);
  }
}
