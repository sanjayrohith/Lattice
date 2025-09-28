import { z } from 'zod';

/**
 * A configured agent's minimal identity and backend binding. Expanded with
 * profile fields (system prompt, tool allowlist, step budget, role) in
 * Phase 3 once the agent registry and orchestrator land.
 */
export const agentSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  backend: z.enum(['sdk', 'acp']),
  modelId: z.string().optional(),
});
export type Agent = z.infer<typeof agentSchema>;

/** The active model selection surfaced in the composer and settings panel. */
export const activeModelSchema = z.object({
  provider: z.string(),
  modelId: z.string(),
});
export type ActiveModel = z.infer<typeof activeModelSchema>;

/** Non-secret user preferences. Credentials live in the encrypted vault, never here. */
export const settingsSchema = z.object({
  theme: z.enum(['dark', 'light', 'system']).default('system'),
  stepCap: z.number().int().positive().default(25),
  defaultAgentId: z.string().nullable().default(null),
  telemetryOptIn: z.boolean().default(false),
});
export type Settings = z.infer<typeof settingsSchema>;

/** A run's lifecycle summary as surfaced to the shell chrome and roster. */
export const runSummarySchema = z.object({
  id: z.string(),
  agentId: z.string(),
  status: z.enum(['idle', 'streaming', 'awaiting-consent', 'executing-tool', 'completed', 'failed', 'aborted']),
  startedAt: z.number(),
});
export type RunSummary = z.infer<typeof runSummarySchema>;

/** Per-workspace Dockview layout bookkeeping, distinct from the persisted layout JSON itself. */
export const layoutMetadataSchema = z.object({
  activeWorkspaceId: z.string().default('default'),
  lastSavedAt: z.number().nullable().default(null),
});
export type LayoutMetadata = z.infer<typeof layoutMetadataSchema>;

/**
 * The single application state shape held authoritatively by the main
 * process and projected read-only into every renderer. See
 * `src/main/state` for the master store and `src/renderer/state` for the
 * Zustand projection.
 */
export const appStateSchema = z.object({
  agents: z.array(agentSchema).default([]),
  activeModel: activeModelSchema.nullable().default(null),
  settings: settingsSchema.default(settingsSchema.parse({})),
  runs: z.array(runSummarySchema).default([]),
  layout: layoutMetadataSchema.default(layoutMetadataSchema.parse({})),
});
export type AppState = z.infer<typeof appStateSchema>;

export function createDefaultAppState(): AppState {
  return appStateSchema.parse({});
}
