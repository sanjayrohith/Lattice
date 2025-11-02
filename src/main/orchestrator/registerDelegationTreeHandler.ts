import { IPC_CHANNELS } from '@shared/ipc/channels';
import { registerHandler } from '../ipc/registerHandler';
import type { DelegationTreeRegistry } from './delegationTreeRegistry';

/** Registers the read-only IPC surface the delegation tree panel polls to render the live hierarchy. */
export function registerDelegationTreeHandler(registry: DelegationTreeRegistry): void {
  registerHandler(IPC_CHANNELS.DELEGATION_TREE, (payload) => ({
    nodes: registry.getTree(payload.rootRunId),
  }));
}
