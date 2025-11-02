import { IPC_CHANNELS } from '@shared/ipc/channels';
import { registerHandler, HandlerError } from '../ipc/registerHandler';
import type { AgentProfileRepository } from '../db/repositories/agentProfileRepository';

/**
 * Registers the agent profile CRUD IPC surface: list, create, update,
 * duplicate, and delete, all backed by {@link AgentProfileRepository}.
 * `update` and `duplicate` return `agent: null` rather than an error
 * for an unknown id, since "the profile you tried to modify is already
 * gone" is an unremarkable outcome a renderer should just re-render
 * away, not a failure envelope.
 */
export function registerAgentHandlers(repository: AgentProfileRepository): void {
  registerHandler(IPC_CHANNELS.AGENT_LIST, () => ({
    agents: repository.list(),
  }));

  registerHandler(IPC_CHANNELS.AGENT_CREATE, (payload) => {
    const agent = repository.create({
      displayName: payload.profile.displayName,
      backend: payload.profile.backend,
      systemPrompt: payload.profile.systemPrompt ?? '',
      toolAllowlist: payload.profile.toolAllowlist,
      stepBudget: payload.profile.stepBudget ?? 25,
      role: payload.profile.role ?? 'worker',
    });
    return { agent };
  });

  registerHandler(IPC_CHANNELS.AGENT_UPDATE, (payload) => ({
    agent: repository.update(payload.id, payload.patch) ?? null,
  }));

  registerHandler(IPC_CHANNELS.AGENT_DUPLICATE, (payload) => ({
    agent: repository.duplicate(payload.id, payload.displayName) ?? null,
  }));

  registerHandler(IPC_CHANNELS.AGENT_DELETE, (payload) => {
    const deleted = repository.delete(payload.id);
    if (!deleted) {
      throw new HandlerError('AGENT_NOT_FOUND', `no agent profile with id "${payload.id}"`);
    }
    return { deleted };
  });
}
