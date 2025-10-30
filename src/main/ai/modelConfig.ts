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
