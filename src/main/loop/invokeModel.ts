import { streamText, tool as sdkTool, type LanguageModel, type ModelMessage } from '../ai/sdk';
import { createProviderModel, type CredentialSource } from '../ai/providerFactory';
import type { ModelConfig } from '../ai/modelConfig';
import { toModelMessages, type InternalMessage } from '../ai/messages';
import type { AnyTool } from '../tools/types';

/**
 * Converts the run's toolset into the AI SDK's `tools` record with no
 * `execute` bound to any entry. Omitting `execute` is deliberate: it
 * makes every tool a model-visible, SDK-described capability without
 * letting the SDK auto-run it. The loop is what actually calls a tool's
 * `execute`, after routing the emitted call through the registry,
 * argument validation, and the consent gate.
 */
// See AnyTool: a heterogeneous collection of tools with differing Input
// types cannot be given a single precise generic here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toSdkToolSet(tools: readonly AnyTool[]): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolSet: Record<string, any> = {};
  for (const t of tools) {
    toolSet[t.name] = sdkTool({ description: t.description, inputSchema: t.inputSchema });
  }
  return toolSet;
}

export interface BuildModelCallParams {
  model: LanguageModel;
  systemPrompt?: string;
  history: readonly InternalMessage[];
  tools?: readonly AnyTool[];
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

/**
 * Compiles the message history, system instructions, and active toolset
 * into the parameter object `streamText` expects. Kept separate from the
 * call itself so it can be unit tested — and the resulting messages/tools
 * inspected — without ever making a network call.
 */
export function buildStreamTextParams(params: BuildModelCallParams): Parameters<typeof streamText>[0] {
  const messages: ModelMessage[] = [
    ...(params.systemPrompt ? [{ role: 'system' as const, content: params.systemPrompt }] : []),
    ...toModelMessages(params.history),
  ];

  return {
    model: params.model,
    messages,
    ...(params.tools ? { tools: toSdkToolSet(params.tools) } : {}),
    ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
    ...(params.maxOutputTokens !== undefined ? { maxOutputTokens: params.maxOutputTokens } : {}),
    ...(params.signal ? { abortSignal: params.signal } : {}),
  };
}

/** Calls the SDK's streaming text generation with an already-resolved `model`. Consumed as an async stream by the caller. */
export function invokeModelStream(params: BuildModelCallParams): ReturnType<typeof streamText> {
  return streamText(buildStreamTextParams(params));
}

export interface InvokeAgentModelParams {
  modelConfig: ModelConfig;
  credentials: CredentialSource;
  history: readonly InternalMessage[];
  tools?: readonly AnyTool[];
  signal?: AbortSignal;
}

/**
 * The loop's actual entry point: resolves the provider model from the
 * agent's `modelConfig` and a credential source, then invokes the
 * streaming call. See {@link buildStreamTextParams} for the
 * network-free, testable compilation step this wraps.
 */
export function invokeAgentModelStream(params: InvokeAgentModelParams): ReturnType<typeof streamText> {
  const model = createProviderModel(
    params.modelConfig.providerId,
    params.modelConfig.modelId,
    params.credentials,
  );

  return invokeModelStream({
    model,
    systemPrompt: params.modelConfig.systemPrompt,
    history: params.history,
    tools: params.tools,
    temperature: params.modelConfig.temperature,
    maxOutputTokens: params.modelConfig.maxTokens,
    signal: params.signal,
  });
}
