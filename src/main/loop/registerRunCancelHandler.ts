import { IPC_CHANNELS } from '@shared/ipc/channels';
import { registerHandler } from '@main/ipc/registerHandler';
import type { RunAbortRegistry } from './runAbortRegistry';

/** Registers `run:cancel`, letting the renderer trigger the abort signal for an in-flight run. */
export function registerRunCancelHandler(registry: RunAbortRegistry): void {
  registerHandler(IPC_CHANNELS.RUN_CANCEL, (payload) => ({
    cancelled: registry.cancel(payload.runId),
  }));
}
