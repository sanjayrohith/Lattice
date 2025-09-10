import { describe, expect, it } from 'vitest';
import type { Session } from 'electron';
import { applyContentSecurityPolicy } from './contentSecurityPolicy';

function createMockSession(): Session {
  const handlers: Array<(details: unknown, callback: (response: unknown) => void) => void> = [];

  return {
    webRequest: {
      onHeadersReceived: (
        handler: (details: unknown, callback: (response: unknown) => void) => void,
      ) => {
        handlers.push(handler);
      },
    },
    // expose for assertions
    __handlers: handlers,
  } as unknown as Session;
}

describe('applyContentSecurityPolicy', () => {
  it('registers a headers-received handler that injects a strict CSP', () => {
    const mockSession = createMockSession();
    applyContentSecurityPolicy(mockSession);

    const handlers = (mockSession as unknown as { __handlers: unknown[] }).__handlers;
    expect(handlers).toHaveLength(1);

    let capturedResponse: { responseHeaders?: Record<string, string[]> } | undefined;
    const handler = handlers[0] as (
      details: { responseHeaders?: Record<string, string[]> },
      callback: (response: unknown) => void,
    ) => void;

    handler({ responseHeaders: { 'X-Existing': ['1'] } }, (response) => {
      capturedResponse = response as typeof capturedResponse;
    });

    const csp = capturedResponse?.responseHeaders?.['Content-Security-Policy']?.[0] ?? '';

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("object-src 'none'");
    expect(capturedResponse?.responseHeaders?.['X-Existing']).toEqual(['1']);
  });
});
