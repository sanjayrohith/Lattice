import { describe, expect, it } from 'vitest';
import { redactSecrets } from './logger';

describe('redactSecrets', () => {
  it('redacts an OpenAI-shaped secret key', () => {
    const input = 'using key sk-abcdefghijklmnopqrstuvwxyz123456';
    expect(redactSecrets(input)).toBe('using key [REDACTED]');
  });

  it('redacts a bearer token', () => {
    const input = 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789';
    expect(redactSecrets(input)).toBe('Authorization: [REDACTED]');
  });

  it('leaves ordinary log text untouched', () => {
    const input = 'application ready';
    expect(redactSecrets(input)).toBe(input);
  });
});
