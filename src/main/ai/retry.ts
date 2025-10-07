export interface RetryableErrorLike {
  statusCode?: number;
  isRetryable?: boolean;
  responseHeaders?: Record<string, string>;
}

export interface RetryOptions {
  /** Total attempts, including the first; defaults to 3. */
  maxAttempts?: number;
  /** Base delay for exponential backoff, in milliseconds; defaults to 500. */
  baseDelayMs?: number;
  /** Upper bound on the computed backoff delay, in milliseconds; defaults to 15000. */
  maxDelayMs?: number;
  /** Injectable sleep implementation so tests can run without real timers. */
  sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

/**
 * Distinguishes a transient failure worth retrying (rate limits, server
 * errors, connection resets) from a fatal one (bad request, auth
 * failure, an explicit `isRetryable: false` from the provider) that
 * retrying can never fix.
 */
export function isRetryableError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const candidate = error as RetryableErrorLike & { code?: string };
    if (typeof candidate.isRetryable === 'boolean') {
      return candidate.isRetryable;
    }
    if (typeof candidate.statusCode === 'number') {
      return RETRYABLE_STATUS_CODES.has(candidate.statusCode);
    }
    if (candidate.code === 'ECONNRESET' || candidate.code === 'ETIMEDOUT') {
      return true;
    }
  }
  return false;
}

/** Parses a `Retry-After` response header (seconds, per RFC 9110) into milliseconds. */
export function parseRetryAfterMs(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const headers = (error as RetryableErrorLike).responseHeaders;
  const raw = headers?.['retry-after'] ?? headers?.['Retry-After'];
  if (!raw) return undefined;

  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

function backoffDelayMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = baseDelayMs * 2 ** (attempt - 1);
  return Math.min(exponential, maxDelayMs);
}

/**
 * Calls `fn`, retrying on a retryable failure with exponential backoff. A
 * provider-reported `Retry-After` header, when present, takes precedence
 * over the computed backoff delay for that attempt. A fatal error, or
 * exhausting `maxAttempts`, rejects with the last error encountered.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 15_000;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= maxAttempts || !isRetryableError(error)) {
        throw error;
      }

      const delay = parseRetryAfterMs(error) ?? backoffDelayMs(attempt, baseDelayMs, maxDelayMs);
      await sleep(delay);
    }
  }

  // Unreachable: the loop above always either returns or throws.
  throw lastError;
}
