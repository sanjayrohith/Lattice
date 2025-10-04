import { safeStorage } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { registerHandler } from '@main/ipc/registerHandler';
import { probeEncryptionAvailability } from './safeStorageProbe';

/**
 * Registers `security:encryption-status` so the renderer can surface an
 * explicit "credential encryption unavailable" state — rather than
 * silently persisting secrets in a degraded, unencrypted form — whenever
 * the OS keychain backing `safeStorage` is missing.
 */
export function registerEncryptionStatusHandler(): void {
  registerHandler(IPC_CHANNELS.SECURITY_ENCRYPTION_STATUS, () =>
    probeEncryptionAvailability(safeStorage),
  );
}
