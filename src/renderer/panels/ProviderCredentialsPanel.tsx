import { useCallback, useEffect, useState } from 'react';
import { IPC_CHANNELS } from '@shared/ipc/channels';

interface ProviderDescriptor {
  id: string;
  displayName: string;
}

const PROVIDERS: readonly ProviderDescriptor[] = [
  { id: 'openai', displayName: 'OpenAI' },
  { id: 'anthropic', displayName: 'Anthropic' },
  { id: 'google', displayName: 'Google' },
];

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
    }
  }

  return (
    <div className="panel panel--provider-credentials">
      <h2 className="provider-credentials__heading">Provider Credentials</h2>
      <ul className="provider-credentials__list">
        {PROVIDERS.map((provider) => {
          const configured = configuredIds.has(provider.id);
          const busy = pendingId === provider.id;

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
            </li>
          );
        })}
      </ul>
    </div>
  );
}
