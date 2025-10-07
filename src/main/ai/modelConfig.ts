import { z } from 'zod';

/**
 * Everything the agent loop needs to make a single provider call: which
 * provider and model, its sampling parameters, and the system prompt that
 * frames the run. This is the main-process runtime shape the loop
 * consumes — distinct from the lightweight `agentSchema` in
 * `src/shared/state`, which only carries what every renderer needs to
 * display the roster.
 */
export const modelConfigSchema = z.object({
  providerId: z.enum(['openai', 'anthropic', 'google']),
  modelId: z.string().min(1),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().positive().default(4096),
  systemPrompt: z.string().default(''),
});
export type ModelConfig = z.infer<typeof modelConfigSchema>;

/**
 * A runnable agent profile: its identity plus the model configuration it
 * drives. Expanded in Phase 3 (`feat(agents): define agent profile
 * model`) with a backend reference, tool allowlist, and step budget once
 * the orchestrator can target either an SDK model or an ACP connector.
 */
export const agentProfileSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  modelConfig: modelConfigSchema,
});
export type AgentProfile = z.infer<typeof agentProfileSchema>;
