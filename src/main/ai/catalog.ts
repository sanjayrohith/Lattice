export type ProviderId = 'openai' | 'anthropic' | 'google';

export interface ModelDescriptor {
  id: string;
  displayName: string;
  contextWindow: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
}

export interface ProviderDescriptor {
  id: ProviderId;
  displayName: string;
  models: readonly ModelDescriptor[];
}

/**
 * The static catalog of every provider and model the application knows how
 * to drive through the unified AI SDK layer. Nothing here calls out to a
 * provider — it exists so the rest of the app (settings UI, the model
 * picker, the credential-resolving factory) has a single source of truth
 * for context window size and tool/streaming capability instead of hand
 * coding those facts at each call site.
 */
export const providerCatalog: readonly ProviderDescriptor[] = [
  {
    id: 'openai',
    displayName: 'OpenAI',
    models: [
      {
        id: 'gpt-4o',
        displayName: 'GPT-4o',
        contextWindow: 128_000,
        supportsTools: true,
        supportsStreaming: true,
      },
      {
        id: 'gpt-4o-mini',
        displayName: 'GPT-4o mini',
        contextWindow: 128_000,
        supportsTools: true,
        supportsStreaming: true,
      },
    ],
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    models: [
      {
        id: 'claude-3-5-sonnet-latest',
        displayName: 'Claude 3.5 Sonnet',
        contextWindow: 200_000,
        supportsTools: true,
        supportsStreaming: true,
      },
      {
        id: 'claude-3-5-haiku-latest',
        displayName: 'Claude 3.5 Haiku',
        contextWindow: 200_000,
        supportsTools: true,
        supportsStreaming: true,
      },
    ],
  },
  {
    id: 'google',
    displayName: 'Google',
    models: [
      {
        id: 'gemini-1.5-pro',
        displayName: 'Gemini 1.5 Pro',
        contextWindow: 2_000_000,
        supportsTools: true,
        supportsStreaming: true,
      },
      {
        id: 'gemini-1.5-flash',
        displayName: 'Gemini 1.5 Flash',
        contextWindow: 1_000_000,
        supportsTools: true,
        supportsStreaming: true,
      },
    ],
  },
];

export function listProviders(): readonly ProviderDescriptor[] {
  return providerCatalog;
}

export function findProvider(providerId: string): ProviderDescriptor | undefined {
  return providerCatalog.find((provider) => provider.id === providerId);
}

export function findModel(providerId: string, modelId: string): ModelDescriptor | undefined {
  return findProvider(providerId)?.models.find((model) => model.id === modelId);
}
