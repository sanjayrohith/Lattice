import type { Schema } from 'electron-store';

export type Theme = 'dark' | 'light';

/** Non-secret, user-facing application preferences — never a credential or other secret. */
export interface Preferences {
  theme: Theme;
  /** Hard cap on agent-loop iterations per run; enforced regardless of this value's upper bound. */
  stepCap: number;
  defaultAgentId: string | null;
  telemetryOptIn: boolean;
}

export const PREFERENCES_DEFAULTS: Preferences = {
  theme: 'dark',
  stepCap: 25,
  defaultAgentId: null,
  telemetryOptIn: false,
};

/** JSON Schema enforced by `electron-store` (via `conf`) on every read and write. */
export const preferencesSchema: Schema<Preferences> = {
  theme: { type: 'string', enum: ['dark', 'light'], default: PREFERENCES_DEFAULTS.theme },
  stepCap: { type: 'number', minimum: 1, maximum: 200, default: PREFERENCES_DEFAULTS.stepCap },
  defaultAgentId: { type: ['string', 'null'], default: PREFERENCES_DEFAULTS.defaultAgentId },
  telemetryOptIn: { type: 'boolean', default: PREFERENCES_DEFAULTS.telemetryOptIn },
};
