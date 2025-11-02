import type { RunStreamEvent } from '@shared/ipc/events';
import type { InternalMessage } from '../ai/messages';
import type { AnyTool } from '../tools/types';

export interface AgentBackendRunParams {
  runId: string;
  history: readonly InternalMessage[];
  tools?: readonly AnyTool[];
  signal?: AbortSignal;
}

/**
 * The single surface the orchestrator drives every agent through,
 * regardless of whether its turns are produced by a directly invoked
 * SDK model (`SdkAgentBackend`) or a peer reached over the Agent
 * Client Protocol (`AcpAgentBackend`). `stream` yields already
 * normalized {@link RunStreamEvent}s as they occur — the same shape
 * `RunEventBroadcaster` forwards to the renderer — so the rest of the
 * orchestrator never branches on which kind of backend it is talking
 * to. `cancel` requests best-effort early termination of the run
 * identified by `runId`; it is not guaranteed to take effect
 * immediately, matching how both the SDK's `AbortSignal` and ACP's
 * `session/cancel` notification are inherently asynchronous requests
 * rather than synchronous stops.
 */
export interface AgentBackend {
  stream(params: AgentBackendRunParams): AsyncIterable<RunStreamEvent>;
  cancel(runId: string): void;
}
