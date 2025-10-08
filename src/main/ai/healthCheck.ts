import { generateText, type LanguageModel } from './sdk';
import { createProviderModel, MissingCredentialError, type CredentialSource } from './providerFactory';
import { withRetry } from './retry';
import type { ProviderId } from './catalog';

export interface HealthCheckResult {
  ok: boolean;
  error?: string;
}

export interface HealthCheckOptions {
  /** Injectable in place of the real `generateText` call, for tests. */
  generate?: (model: LanguageModel) => Promise<unknown>;
}

const HEALTH_CHECK_PROMPT = 'ping';

/**
 * Confirms a configured credential actually authenticates with its
 * provider by issuing the smallest possible real call, before the user
 * ever starts a run that would otherwise fail deep into a multi-step
 * agent loop. A single retryable transient failure is retried once;
 * anything else — a missing credential, an auth rejection, a network
 * failure — is reported back as a structured, non-throwing result.
 */
export async function checkProviderHealth(
  providerId: ProviderId,
  modelId: string,
  credentials: CredentialSource,
  options: HealthCheckOptions = {},
): Promise<HealthCheckResult> {
  let model: LanguageModel;
  try {
    model = createProviderModel(providerId, modelId, credentials);
  } catch (error) {
    if (error instanceof MissingCredentialError) {
      return { ok: false, error: error.code };
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  const generate =
    options.generate ??
    ((m: LanguageModel) => generateText({ model: m, prompt: HEALTH_CHECK_PROMPT, maxOutputTokens: 1 }));

  try {
    await withRetry(() => generate(model), { maxAttempts: 2, baseDelayMs: 250 });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
