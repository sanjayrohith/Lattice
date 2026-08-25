import { z } from 'zod';
import { modelConfigSchema } from '../ai/modelConfig';

/**
 * Which runtime drives an agent's turns: a directly invoked SDK model
 * (`sdk`, using {@link modelConfigSchema}), or a peer reachable over the
 * Agent Client Protocol (`acp`, identified by the connector id it
 * should be opened through). The orchestrator's `AgentBackend`
 * abstraction is what lets a profile with either backend be
 * run identically by the rest of the loop.
 */
export const agentBackendRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('sdk'), modelConfig: modelConfigSchema }),
  z.object({ kind: z.literal('acp'), connectorId: z.string().min(1) }),
]);
export type AgentBackendRef = z.infer<typeof agentBackendRefSchema>;

/**
 * The role an agent plays in a multi-agent orchestration mode (chain
 * stage ordering, swarm turn-taking, review/critique pairing). `worker`
 * is the default for a standalone or delegated agent with no special
 * standing in a mode.
 */
export const agentRoleSchema = z.enum([
  'worker',
  'orchestrator',
  'project-manager',
  'architect',
  'developer',
  'devops',
  'reviewer',
  'critic',
]);
export type AgentRole = z.infer<typeof agentRoleSchema>;

/**
 * The full runnable agent profile: identity, which backend runs its
 * turns, the system prompt framing its behavior, the subset of tools it
 * may call (`undefined` means every registered tool, per
 * `ToolRegistry.listForAgent`), a hard cap on loop iterations before
 * the run is forcibly ended, and the role it plays in orchestration
 * modes.
 */
export const agentProfileSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  backend: agentBackendRefSchema,
  systemPrompt: z.string().default(''),
  toolAllowlist: z.array(z.string()).optional(),
  stepBudget: z.number().int().positive().default(25),
  role: agentRoleSchema.default('worker'),
});
export type AgentProfile = z.infer<typeof agentProfileSchema>;
