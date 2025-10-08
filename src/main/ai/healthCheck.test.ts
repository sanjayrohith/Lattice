import { describe, expect, it, vi } from 'vitest';
import { checkProviderHealth } from './healthCheck';
import type { CredentialSource } from './providerFactory';

function credentialsWith(entries: Record<string, string>): CredentialSource {
  return { get: (id) => entries[id] };
}

describe('checkProviderHealth', () => {
  it('reports MISSING_CREDENTIAL when no key is configured, without calling generate', async () => {
    const generate = vi.fn();

    const result = await checkProviderHealth('openai', 'gpt-4o', credentialsWith({}), { generate });

    expect(result).toEqual({ ok: false, error: 'MISSING_CREDENTIAL' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('reports ok when the provider call succeeds', async () => {
    const generate = vi.fn().mockResolvedValue({ text: 'pong' });

    const result = await checkProviderHealth('openai', 'gpt-4o', credentialsWith({ openai: 'sk-test' }), {
      generate,
    });

    expect(result).toEqual({ ok: true });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('reports the failure message when the provider call rejects fatally', async () => {
    const generate = vi.fn().mockRejectedValue(new Error('invalid api key'));

    const result = await checkProviderHealth('openai', 'gpt-4o', credentialsWith({ openai: 'sk-bad' }), {
      generate,
    });

    expect(result).toEqual({ ok: false, error: 'invalid api key' });
  });

  it('retries once on a transient failure before succeeding', async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce({ statusCode: 503 })
      .mockResolvedValueOnce({ text: 'pong' });

    const result = await checkProviderHealth('openai', 'gpt-4o', credentialsWith({ openai: 'sk-test' }), {
      generate,
    });

    expect(result).toEqual({ ok: true });
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
