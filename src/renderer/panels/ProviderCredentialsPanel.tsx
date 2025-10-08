import { useCallback, useEffect, useState } from 'react';
import { IPC_CHANNELS } from '@shared/ipc/channels';

interface ProviderDescriptor {
  id: 'openai' | 'anthropic' | 'google';
  displayName: string;
  /** The model used for the connectivity health check — any model on the provider's catalog works. */
  healthCheckModelId: string;
}

const PROVIDERS: readonly ProviderDescriptor[] = [
  { id: 'openai', displayName: 'OpenAI', healthCheckModelId: 'gpt-4o-mini' },
  { id: 'anthropic', displayName: 'Anthropic', healthCheckModelId: 'claude-3-5-haiku-latest' },
  { id: 'google', displayName: 'Google', healthCheckModelId: 'gemini-1.5-flash' },
];

type HealthCheckStatus = { state: 'ok' } | { state: 'error'; message: string };

/**
 * Settings panel for provider API keys. Every key input is write-only —
 * once submitted through `vault:set` the field is cleared and the value is
 * never read back. Configured state comes from `vault:list`, which can
 * only ever report presence and a timestamp, never the credential itself.
 */
export default function ProviderCredentialsPanel(): React.JSX.Element {
  const [configuredIds, setConfiguredIds] = useState<ReadonlySet<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | undefined>(undefined);
  const [healthStatus, setHealthStatus] = useState<Record<string, HealthCheckStatus>>({});

  const refresh = useCallback(async () => {
    const result = await window.electronAPI.invoke(IPC_CHANNELS.VAULT_LIST, undefined);
    if (result.ok) {
      setConfiguredIds(new Set(result.data.credentials.map((c) => c.id)));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void window.electronAPI.invoke(IPC_CHANNELS.VAULT_LIST, undefined).then((result) => {
      if (!cancelled && result.ok) {
        setConfiguredIds(new Set(result.data.credentials.map((c) => c.id)));
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave(id: string): Promise<void> {
    const value = drafts[id]?.trim();
    if (!value) return;

    setPendingId(id);
    try {
      const result = await window.electronAPI.invoke(IPC_CHANNELS.VAULT_SET, { id, value });
      if (result.ok) {
        setDrafts((prev) => ({ ...prev, [id]: '' }));
        await refresh();
      }
    } finally {
      setPendingId(undefined);
    }
  }

  async function handleDelete(id: string): Promise<void> {
    setPendingId(id);
    try {
      const result = await window.electronAPI.invoke(IPC_CHANNELS.VAULT_DELETE, { id });
      if (result.ok) {
        await refresh();
      }
    } finally {
      setPendingId(undefined);
      setHealthStatus((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }

  async function handleTestConnection(provider: ProviderDescriptor): Promise<void> {
    setPendingId(provider.id);
    try {
      const result = await window.electronAPI.invoke(IPC_CHANNELS.AI_PROVIDER_HEALTH_CHECK, {
        providerId: provider.id,
        modelId: provider.healthCheckModelId,
      });
      if (result.ok) {
        setHealthStatus((prev) => ({
          ...prev,
          [provider.id]: result.data.ok
            ? { state: 'ok' }
            : { state: 'error', message: result.data.error ?? 'unknown error' },
        }));
      } else {
        setHealthStatus((prev) => ({
          ...prev,
          [provider.id]: { state: 'error', message: result.error.message },
        }));
      }
    } finally {
      setPendingId(undefined);
    }
  }

  return (
    <div className="panel panel--provider-credentials">
      <h2 className="provider-credentials__heading">Provider Credentials</h2>
      <ul className="provider-credentials__list">
        {PROVIDERS.map((provider) => {
          const configured = configuredIds.has(provider.id);
          const busy = pendingId === provider.id;
          const health = healthStatus[provider.id];

          return (
            <li key={provider.id} className="provider-credentials__row">
              <span className="provider-credentials__name">{provider.displayName}</span>
              <span
                data-testid={`status-${provider.id}`}
                className={`provider-credentials__status provider-credentials__status--${
                  configured ? 'configured' : 'not-configured'
                }`}
              >
                {configured ? 'Configured' : 'Not configured'}
              </span>
              <input
                type="password"
                autoComplete="off"
                aria-label={`${provider.displayName} API key`}
                placeholder={configured ? '••••••••' : 'Enter API key'}
                value={drafts[provider.id] ?? ''}
                disabled={busy}
                onChange={(event) =>
                  setDrafts((prev) => ({ ...prev, [provider.id]: event.target.value }))
                }
              />
              <button
                type="button"
                disabled={busy || !drafts[provider.id]?.trim()}
                onClick={() => void handleSave(provider.id)}
              >
                Save
              </button>
              <button
                type="button"
                disabled={busy || !configured}
                onClick={() => void handleDelete(provider.id)}
              >
                Delete
              </button>
              <button
                type="button"
                disabled={busy || !configured}
                onClick={() => void handleTestConnection(provider)}
              >
                Test connection
              </button>
              {health ? (
                <span
                  data-testid={`health-${provider.id}`}
                  className={`provider-credentials__health provider-credentials__health--${health.state}`}
                >
                  {health.state === 'ok' ? 'Connected' : `Failed: ${health.message}`}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
