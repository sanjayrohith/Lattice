import type { RunStreamEvent } from '@shared/ipc/events';
import { invokeAgentModelStream, type InvokeAgentModelParams } from '../loop/invokeModel';
import type { AgentBackend, AgentBackendRunParams } from './agentBackend';

/** Injectable so tests never make a real provider call; defaults to the real streaming invocation. */
export type StreamInvoker = (params: InvokeAgentModelParams) => ReturnType<typeof invokeAgentModelStream>;

// The AI SDK's streamed part shapes are broader than what this backend
// normalizes; duck-typing the handful of fields actually read avoids
// importing the SDK's large internal part union just to narrow it back
// down to two cases.
interface SdkStreamPartLike {
  type: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
}

function toRunStreamEvent(part: SdkStreamPartLike, runId: string): RunStreamEvent | undefined {
  if (part.type === 'text-delta' && typeof part.text === 'string') {
    return { type: 'text-delta', runId, delta: part.text };
  }
  if (part.type === 'tool-call' && part.toolCallId && part.toolName) {
    return { type: 'tool-start', runId, toolCallId: part.toolCallId, toolName: part.toolName };
  }
  return undefined;
}

/**
 * Drives an {@link AgentBackend} turn by directly invoking an AI SDK
 * model. Tool execution itself happens outside this backend — the
 * orchestrator's own dispatch loop calls the tool and reinjects the
 * result — so this backend only ever emits `text-delta` and
 * `tool-start` events off the model's stream, never `tool-result`.
 */
export class SdkAgentBackend implements AgentBackend {
  private readonly controllers = new Map<string, AbortController>();

  constructor(
    private readonly baseParams: Omit<InvokeAgentModelParams, 'history' | 'tools' | 'signal'>,
    private readonly streamFn: StreamInvoker = invokeAgentModelStream,
  ) {}

  async *stream(params: AgentBackendRunParams): AsyncIterable<RunStreamEvent> {
    const controller = new AbortController();
    this.controllers.set(params.runId, controller);

    const signal = params.signal
      ? AbortSignal.any([params.signal, controller.signal])
      : controller.signal;

    try {
      const result = this.streamFn({
        ...this.baseParams,
        history: params.history,
        tools: params.tools,
        signal,
      });

      for await (const part of result.fullStream) {
        const event = toRunStreamEvent(part as SdkStreamPartLike, params.runId);
        if (event) yield event;
      }
    } finally {
      this.controllers.delete(params.runId);
    }
  }

  cancel(runId: string): void {
    this.controllers.get(runId)?.abort();
  }
}
