import log from 'electron-log/main';

/**
 * Patterns matching secret-shaped values (API keys, bearer tokens, long
 * hex/base64 blobs) that must never reach the log file or console verbatim.
 */
const SECRET_PATTERNS: readonly RegExp[] = [
  /\b(sk|pk|rk)-[A-Za-z0-9]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi,
  /\b[A-Za-z0-9+/]{32,}={0,2}\b/g,
];

const REDACTED = '[REDACTED]';

export function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, REDACTED), value);
}

function redactHookData(data: unknown[]): unknown[] {
  return data.map((entry) => (typeof entry === 'string' ? redactSecrets(entry) : entry));
}

let initialized = false;

/**
 * Initializes the shared structured logging pipeline: file transport,
 * console transport, and a redaction hook that scrubs secret-shaped values
 * from every log line before it is written or printed.
 */
export function initializeLogger(): typeof log {
  if (initialized) {
    return log;
  }
  initialized = true;

  log.initialize();

  log.transports.file.level = 'info';
  log.transports.console.level = 'debug';

  log.hooks.push((message) => {
    message.data = redactHookData(message.data);
    return message;
  });

  return log;
}

export { log };
