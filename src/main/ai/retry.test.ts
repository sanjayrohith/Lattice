import { describe, expect, it, vi } from 'vitest';
import { isRetryableError, parseRetryAfterMs, withRetry } from './retry';

describe('isRetryableError', () => {
  it('trusts an explicit isRetryable flag', () => {
    expect(isRetryableError({ isRetryable: true, statusCode: 400 })).toBe(true);
    expect(isRetryableError({ isRetryable: false, statusCode: 500 })).toBe(false);
  });

  it('treats common transient status codes as retryable', () => {
    expect(isRetryableError({ statusCode: 429 })).toBe(true);
    expect(isRetryableError({ statusCode: 503 })).toBe(true);
  });

  it('treats client errors other than 408/409/425/429 as fatal', () => {
    expect(isRetryableError({ statusCode: 400 })).toBe(false);
    expect(isRetryableError({ statusCode: 401 })).toBe(false);
    expect(isRetryableError({ statusCode: 404 })).toBe(false);
  });

  it('treats connection reset and timeout errors as retryable', () => {
    expect(isRetryableError({ code: 'ECONNRESET' })).toBe(true);
    expect(isRetryableError({ code: 'ETIMEDOUT' })).toBe(true);
  });

  it('treats a non-error-shaped value as fatal', () => {
    expect(isRetryableError('boom')).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });
});

describe('parseRetryAfterMs', () => {
  it('converts a Retry-After header in seconds to milliseconds', () => {
    expect(parseRetryAfterMs({ responseHeaders: { 'retry-after': '2' } })).toBe(2000);
  });

  it('is case insensitive on the header name', () => {
    expect(parseRetryAfterMs({ responseHeaders: { 'Retry-After': '1' } })).toBe(1000);
  });

  it('returns undefined when absent', () => {
    expect(parseRetryAfterMs({ responseHeaders: {} })).toBeUndefined();
    expect(parseRetryAfterMs({})).toBeUndefined();
  });

  it('returns undefined for a non-numeric header value', () => {
    expect(parseRetryAfterMs({ responseHeaders: { 'retry-after': 'not-a-number' } })).toBeUndefined();
  });
});

describe('withRetry', () => {
  function fakeSleep() {
    const delays: number[] = [];
    return { delays, sleep: async (ms: number) => void delays.push(ms) };
  }

  it('returns the result on first success without sleeping', async () => {
    const { sleep, delays } = fakeSleep();
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await withRetry(fn, { sleep });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it('retries a retryable failure and eventually succeeds', async () => {
    const { sleep, delays } = fakeSleep();
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ statusCode: 429 })
      .mockRejectedValueOnce({ statusCode: 500 })
      .mockResolvedValueOnce('ok');

    const result = await withRetry(fn, { sleep, maxAttempts: 5, baseDelayMs: 100 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([100, 200]);
  });

  it('does not retry a fatal error', async () => {
    const { sleep } = fakeSleep();
    const fn = vi.fn().mockRejectedValue({ statusCode: 401 });

    await expect(withRetry(fn, { sleep })).rejects.toEqual({ statusCode: 401 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws the last error after exhausting maxAttempts', async () => {
    const { sleep } = fakeSleep();
    const fn = vi.fn().mockRejectedValue({ statusCode: 503 });

    await expect(withRetry(fn, { sleep, maxAttempts: 3, baseDelayMs: 10 })).rejects.toEqual({
      statusCode: 503,
    });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('caps the computed backoff delay at maxDelayMs', async () => {
    const { sleep, delays } = fakeSleep();
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ statusCode: 500 })
      .mockRejectedValueOnce({ statusCode: 500 })
      .mockResolvedValueOnce('ok');

    await withRetry(fn, { sleep, maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 1500 });

    expect(delays).toEqual([1000, 1500]);
  });

  it('prefers a Retry-After header over the computed backoff delay', async () => {
    const { sleep, delays } = fakeSleep();
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ statusCode: 429, responseHeaders: { 'retry-after': '3' } })
      .mockResolvedValueOnce('ok');

    await withRetry(fn, { sleep, maxAttempts: 3, baseDelayMs: 100 });

    expect(delays).toEqual([3000]);
  });
});
