import { IPC_CHANNELS } from '@shared/ipc/channels';
import { registerHandler } from '@main/ipc/registerHandler';
import { log } from './logger';

/**
 * Registers the `log:write` handler so renderer code can emit into the same
 * structured log stream as the main process, tagged with its origin.
 */
export function registerLogHandler(): void {
  registerHandler(IPC_CHANNELS.LOG_WRITE, ({ level, message, meta }) => {
    log[level](`[renderer] ${message}`, meta ?? {});
  });
}
