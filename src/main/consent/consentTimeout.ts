import type { PendingDecisionRegistry } from '../loop/abortCleanup';
import type { ConsentDecision } from './consentGate';

/** How long a consent request waits for a decision before defaulting to declined. */
export const DEFAULT_CONSENT_TIMEOUT_MS = 60_000;

/**
 * Schedules a fallback resolution of `toolCallId` to `declined` after
 * `timeoutMs`, so a consent request nobody ever answers — the prompting
 * window was closed, the user walked away — suspends the run for at
 * most that long rather than forever. `PendingDecisionRegistry.resolve`
 * is a no-op if the id was already resolved (by the user, or by abort
 * cleanup), so firing this timer harmlessly does nothing in that case.
 * Returns a function that cancels the timer, for callers that resolve
 * before it fires.
 */
export function scheduleConsentTimeout(
  pending: PendingDecisionRegistry<ConsentDecision>,
  toolCallId: string,
  timeoutMs: number = DEFAULT_CONSENT_TIMEOUT_MS,
): () => void {
  const timer = setTimeout(() => {
    pending.resolve(toolCallId, 'declined');
  }, timeoutMs);

  return () => clearTimeout(timer);
}
