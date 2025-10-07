import { createAnthropic, createGoogleGenerativeAI, createOpenAI, type LanguageModel } from './sdk';
import type { ProviderId } from './catalog';

/** Thrown by {@link createProviderModel} when no credential is configured for the requested provider. */
export class MissingCredentialError extends Error {
  readonly code = 'MISSING_CREDENTIAL';

  constructor(public readonly providerId: string) {
    super(`no credential configured for provider "${providerId}"`);
    this.name = 'MissingCredentialError';
  }
}

/** The subset of {@link CredentialVault}'s decrypted-credential cache this factory depends on. */
export interface CredentialSource {
  get(id: string): string | undefined;
}

/**
 * Instantiates a ready-to-call {@link LanguageModel} for `providerId`/`modelId`
 * on demand, pulling the provider's API key from `credentials`. No client
 * is constructed — and no credential is read — until this function is
 * actually called, so an unconfigured provider never allocates a client
 * that would immediately fail on first use.
 */
export function createProviderModel(
  providerId: ProviderId,
  modelId: string,
  credentials: CredentialSource,
): LanguageModel {
  const apiKey = credentials.get(providerId);
  if (!apiKey) {
    throw new MissingCredentialError(providerId);
  }

  switch (providerId) {
    case 'openai':
      return createOpenAI({ apiKey })(modelId);
    case 'anthropic':
      return createAnthropic({ apiKey })(modelId);
    case 'google':
      return createGoogleGenerativeAI({ apiKey })(modelId);
    default: {
      const exhaustive: never = providerId;
      throw new Error(`unhandled provider id: ${String(exhaustive)}`);
    }
  }
}
