import { IPC_CHANNELS } from '@shared/ipc/channels';
import { registerHandler } from '@main/ipc/registerHandler';
import { checkProviderHealth } from './healthCheck';
import type { CredentialSource } from './providerFactory';
import type { ProviderId } from './catalog';

/**
 * Registers `ai:provider-health-check`, letting the settings panel verify
 * a stored credential authenticates before the user starts a real run.
 */
export function registerHealthCheckHandler(credentials: CredentialSource): void {
  registerHandler(IPC_CHANNELS.AI_PROVIDER_HEALTH_CHECK, async (payload) => {
    const result = await checkProviderHealth(
      payload.providerId as ProviderId,
      payload.modelId,
      credentials,
    );
    return result.error === undefined ? { ok: result.ok } : { ok: result.ok, error: result.error };
  });
}
