import type { Session } from 'electron';

/**
 * Hosts that renderer code is permitted to open network connections to,
 * beyond the app's own origin. Extended as AI providers and MCP servers
 * are wired in during later phases.
 */
export const connectSrcAllowlist: readonly string[] = [];

function buildContentSecurityPolicy(): string {
  const connectSrc = ["'self'", ...connectSrcAllowlist].join(' ');

  const directives: Record<string, string> = {
    'default-src': "'self'",
    'script-src': "'self'",
    'style-src': "'self' 'unsafe-inline'",
    'img-src': "'self' data: blob:",
    'font-src': "'self' data:",
    'connect-src': connectSrc,
    'object-src': "'none'",
    'base-uri': "'none'",
    'form-action': "'none'",
    'frame-ancestors': "'none'",
  };

  return Object.entries(directives)
    .map(([directive, value]) => `${directive} ${value}`)
    .join('; ');
}

/**
 * Attaches a strict Content-Security-Policy to every response served in the
 * given session. Forbids remote script sources, inline `eval`, and any
 * network connection target outside the configured provider allowlist.
 */
export function applyContentSecurityPolicy(session: Session): void {
  const policy = buildContentSecurityPolicy();

  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy],
      },
    });
  });
}
