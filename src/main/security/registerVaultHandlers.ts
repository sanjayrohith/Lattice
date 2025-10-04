import { IPC_CHANNELS } from '@shared/ipc/channels';
import { registerHandler } from '@main/ipc/registerHandler';
import type { CredentialVault } from './credentialVault';

/**
 * Registers the vault's IPC surface: `vault:set`, `vault:has`,
 * `vault:delete`, and `vault:list`. Every response schema here carries
 * presence and metadata only — none can be shaped to include the
 * decrypted credential value, so this surface is safe to expose to any
 * renderer regardless of trust level.
 */
export function registerVaultHandlers(vault: CredentialVault): void {
  registerHandler(IPC_CHANNELS.VAULT_SET, (payload) => {
    vault.set(payload.id, payload.value);
  });

  registerHandler(IPC_CHANNELS.VAULT_HAS, (payload) => ({
    configured: vault.has(payload.id),
  }));

  registerHandler(IPC_CHANNELS.VAULT_DELETE, (payload) => ({
    deleted: vault.delete(payload.id),
  }));

  registerHandler(IPC_CHANNELS.VAULT_LIST, () => ({
    credentials: vault.list(),
  }));
}
