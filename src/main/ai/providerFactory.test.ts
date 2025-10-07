import { describe, expect, it } from 'vitest';
import { createProviderModel, MissingCredentialError, type CredentialSource } from './providerFactory';

function credentialsWith(entries: Record<string, string>): CredentialSource {
  return { get: (id) => entries[id] };
}

describe('createProviderModel', () => {
  it('throws a typed MissingCredentialError when no key is configured', () => {
    const credentials = credentialsWith({});

    expect(() => createProviderModel('openai', 'gpt-4o', credentials)).toThrow(
      MissingCredentialError,
    );
  });

  it('names the missing provider on the thrown error', () => {
    const credentials = credentialsWith({});

    try {
      createProviderModel('anthropic', 'claude-3-5-sonnet-latest', credentials);
      expect.unreachable('expected createProviderModel to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(MissingCredentialError);
      expect((error as MissingCredentialError).code).toBe('MISSING_CREDENTIAL');
      expect((error as MissingCredentialError).providerId).toBe('anthropic');
    }
  });

  it('constructs an openai model when a credential is present', () => {
    const credentials = credentialsWith({ openai: 'sk-test' });

    const model = createProviderModel('openai', 'gpt-4o', credentials);
    expect(model).toBeDefined();
  });

  it('constructs an anthropic model when a credential is present', () => {
    const credentials = credentialsWith({ anthropic: 'sk-test' });

    const model = createProviderModel('anthropic', 'claude-3-5-sonnet-latest', credentials);
    expect(model).toBeDefined();
  });

  it('constructs a google model when a credential is present', () => {
    const credentials = credentialsWith({ google: 'sk-test' });

    const model = createProviderModel('google', 'gemini-1.5-pro', credentials);
    expect(model).toBeDefined();
  });

  it('does not read a credential for a different provider', () => {
    const readIds: string[] = [];
    const credentials: CredentialSource = {
      get: (id) => {
        readIds.push(id);
        return id === 'openai' ? 'sk-test' : undefined;
      },
    };

    createProviderModel('openai', 'gpt-4o', credentials);
    expect(readIds).toEqual(['openai']);
  });
});
