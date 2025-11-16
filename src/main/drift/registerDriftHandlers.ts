import { IPC_CHANNELS } from '@shared/ipc/channels';
import { registerHandler } from '../ipc/registerHandler';
import { atomicWriteFile } from '../tools/atomicWrite';
import { resolveWorkspacePath } from '../tools/pathSandbox';
import type { DriftBaselineStore } from './driftBaseline';
import { detectDrift, type DivergenceSignal } from './driftDetector';

export interface DriftHandlerOptions {
  baselines: DriftBaselineStore;
  workspaceRoot: string;
}

/**
 * Registers the drift alert IPC surface: fetch the latest divergence
 * signals for a run's baseline, accept a diverged file (rebasing the
 * baseline to its current on-disk content, so it stops being flagged),
 * or revert a diverged file (writing the baseline's original content
 * back to disk, undoing the divergence). Both actions are no-ops —
 * reported as `false` rather than throwing — for a run with no
 * tracked baseline or a path not present in it, since by the time the
 * user clicks either button the underlying state may have already
 * moved on.
 */
export function registerDriftHandlers(options: DriftHandlerOptions): void {
  registerHandler(IPC_CHANNELS.DRIFT_SIGNALS, async (payload) => {
    const baseline = options.baselines.get(payload.runId);
    if (!baseline) return { signals: [] };

    const signals: DivergenceSignal[] = await detectDrift(baseline, options.workspaceRoot);
    return { signals };
  });

  registerHandler(IPC_CHANNELS.DRIFT_ACCEPT, async (payload) => {
    const baseline = options.baselines.get(payload.runId);
    if (!baseline) return { accepted: false };

    const signals = await detectDrift(baseline, options.workspaceRoot);
    const signal = signals.find((s) => s.path === payload.path);
    if (!signal) return { accepted: false };

    options.baselines.updateFileSnapshot(payload.runId, payload.path, signal.currentContent);
    return { accepted: true };
  });

  registerHandler(IPC_CHANNELS.DRIFT_REVERT, async (payload) => {
    const baseline = options.baselines.get(payload.runId);
    if (!baseline) return { reverted: false };

    const fileEntry = baseline.files.find((f) => f.path === payload.path);
    if (!fileEntry) return { reverted: false };

    const resolvedPath = resolveWorkspacePath(options.workspaceRoot, payload.path);
    await atomicWriteFile(resolvedPath, fileEntry.content);
    return { reverted: true };
  });
}
