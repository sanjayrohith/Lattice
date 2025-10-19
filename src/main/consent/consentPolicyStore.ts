import type { ConsentPolicy } from '../tools/types';

/** Optional durable backing for user consent preferences, surviving across app restarts. */
export interface ConsentPreferencePersistence {
  get(toolName: string): ConsentPolicy | undefined;
  set(toolName: string, policy: ConsentPolicy): void;
}

/**
 * Resolves the effective consent policy for a tool call in three tiers,
 * highest priority first:
 *
 * 1. A session override — "accept always" or "decline always" chosen
 *    for this specific run, cleared when the session ends.
 * 2. A user preference — set in the settings panel, persisted across
 *    sessions.
 * 3. The tool's own `defaultConsent`, if neither override above applies.
 *
 * `never` is an inescapable floor: if the tool's `defaultConsent` is
 * `never`, no session override or user preference can relax it to `ask`
 * or `always` — a hardcoded refusal always short-circuits every request
 * for that tool, regardless of what any other layer says.
 */
export class ConsentPolicyStore {
  private readonly sessionOverrides = new Map<string, Map<string, ConsentPolicy>>();
  private readonly userPreferences = new Map<string, ConsentPolicy>();

  constructor(private readonly persistence?: ConsentPreferencePersistence) {}

  setSessionOverride(sessionId: string, toolName: string, policy: ConsentPolicy): void {
    const perSession = this.sessionOverrides.get(sessionId) ?? new Map<string, ConsentPolicy>();
    perSession.set(toolName, policy);
    this.sessionOverrides.set(sessionId, perSession);
  }

  getSessionOverride(sessionId: string, toolName: string): ConsentPolicy | undefined {
    return this.sessionOverrides.get(sessionId)?.get(toolName);
  }

  /** Clears every session override for `sessionId`, e.g. once the session ends. */
  clearSession(sessionId: string): void {
    this.sessionOverrides.delete(sessionId);
  }

  setUserPreference(toolName: string, policy: ConsentPolicy): void {
    this.userPreferences.set(toolName, policy);
    this.persistence?.set(toolName, policy);
  }

  getUserPreference(toolName: string): ConsentPolicy | undefined {
    return this.userPreferences.get(toolName) ?? this.persistence?.get(toolName);
  }

  /**
   * Resolves the effective policy for one tool call: the tool's
   * `defaultConsent` floor first, then session override, then user
   * preference, then falling back to `defaultConsent` itself.
   */
  resolve(sessionId: string, toolName: string, defaultConsent: ConsentPolicy): ConsentPolicy {
    if (defaultConsent === 'never') return 'never';

    return (
      this.getSessionOverride(sessionId, toolName) ??
      this.getUserPreference(toolName) ??
      defaultConsent
    );
  }
}
