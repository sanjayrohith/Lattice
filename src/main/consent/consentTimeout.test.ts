import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { DEFAULT_CONSENT_TIMEOUT_MS, scheduleConsentTimeout } from './consentTimeout';
import { PendingDecisionRegistry } from '../loop/abortCleanup';
import type { ConsentDecision } from './consentGate';

describe('scheduleConsentTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('defaults to declined once the timeout elapses', () => {
    const pending = new PendingDecisionRegistry<ConsentDecision>();
    const resolve = vi.fn();
    pending.register('c1', resolve);

    scheduleConsentTimeout(pending, 'c1', 1000);
    vi.advanceTimersByTime(1000);

    expect(resolve).toHaveBeenCalledWith('declined');
  });

  it('does nothing if the decision was already resolved before the timeout fires', () => {
    const pending = new PendingDecisionRegistry<ConsentDecision>();
    const resolve = vi.fn();
    pending.register('c1', resolve);

    pending.resolve('c1', 'accepted');
    scheduleConsentTimeout(pending, 'c1', 1000);
    vi.advanceTimersByTime(1000);

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith('accepted');
  });

  it('the returned cancel function prevents the timeout from firing', () => {
    const pending = new PendingDecisionRegistry<ConsentDecision>();
    const resolve = vi.fn();
    pending.register('c1', resolve);

    const cancel = scheduleConsentTimeout(pending, 'c1', 1000);
    cancel();
    vi.advanceTimersByTime(1000);

    expect(resolve).not.toHaveBeenCalled();
  });

  it('uses the default timeout of 60 seconds when unspecified', () => {
    expect(DEFAULT_CONSENT_TIMEOUT_MS).toBe(60_000);

    const pending = new PendingDecisionRegistry<ConsentDecision>();
    const resolve = vi.fn();
    pending.register('c1', resolve);

    scheduleConsentTimeout(pending, 'c1');
    vi.advanceTimersByTime(59_999);
    expect(resolve).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(resolve).toHaveBeenCalledWith('declined');
  });
});
