import type { AgentRunStateMachine } from '../loop/runStateMachine';
import type { PendingDecisionRegistry } from '../loop/abortCleanup';
import type { ConsentPolicy } from '../tools/types';
import type { ConsentPolicyStore } from './consentPolicyStore';

export type ConsentDecision = 'accepted' | 'declined';

export interface ConsentGateRequest {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

/**
 * The gate every tool call passes through before it may run:
 *
 * - `never` declines immediately, with no run state change and no
 *   prompt — the tool never got a chance to ask.
 * - `always` accepts immediately, likewise without suspending the run.
 * - `ask` transitions the run into `awaiting-consent`, notifies whatever
 *   surfaced the request (the IPC channel built in `feat(ipc): add
 *   correlated consent request channels`), and suspends until a
 *   decision is resolved against `pendingDecisions` by that call's
 *   `toolCallId` — by the user, or as `declined` by abort cleanup
 *   (`feat(loop): implement graceful abort cleanup`).
 *
 * On resolution, the run transitions to `executing-tool` if accepted or
 * back to `streaming` if declined, matching the legal transitions
 * `AgentRunStateMachine` enforces.
 */
export class ConsentGate {
  constructor(
    private readonly policyStore: ConsentPolicyStore,
    private readonly pendingDecisions: PendingDecisionRegistry<ConsentDecision>,
    private readonly stateMachine: AgentRunStateMachine,
    private readonly notifyPending: (request: ConsentGateRequest) => void,
  ) {}

  async requestConsent(
    sessionId: string,
    request: ConsentGateRequest,
    defaultConsent: ConsentPolicy,
  ): Promise<ConsentDecision> {
    const policy = this.policyStore.resolve(sessionId, request.toolName, defaultConsent);

    if (policy === 'never') return 'declined';
    if (policy === 'always') return 'accepted';

    this.stateMachine.transition('awaiting-consent');
    this.notifyPending(request);

    const decision = await new Promise<ConsentDecision>((resolve) => {
      this.pendingDecisions.register(request.toolCallId, resolve);
    });

    this.stateMachine.transition(decision === 'accepted' ? 'executing-tool' : 'streaming');
    return decision;
  }
}
