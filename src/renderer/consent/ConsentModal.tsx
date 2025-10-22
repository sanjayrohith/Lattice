import { useEffect, useState } from 'react';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { ConsentRequestEvent } from '@shared/ipc/events';

type ConsentDecision = 'accept-once' | 'accept-always' | 'decline';

/** Renders `input` as a human-readable, indented JSON preview for the consent prompt. */
function formatArgumentPreview(input: unknown): string {
  try {
    return JSON.stringify(input, null, 2) ?? String(input);
  } catch {
    return String(input);
  }
}

/**
 * Listens for `consent:request` broadcasts and renders a blocking modal
 * for whichever request is currently pending, showing the tool name and
 * a human-readable preview of the fully resolved arguments it would run
 * with. Each action responds over `consent:respond` with a distinct
 * decision: `accept-once` and `decline` resolve only this call, while
 * `accept-always` also tells the main process to stop asking for this
 * tool for the rest of the session.
 */
export function ConsentModal(): React.JSX.Element | null {
  const [pending, setPending] = useState<ConsentRequestEvent | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsubscribe = window.electronAPI.subscribe(IPC_CHANNELS.CONSENT_REQUEST, (event) => {
      setPending(event);
      setSubmitting(false);
    });
    return unsubscribe;
  }, []);

  if (!pending) return null;

  async function respond(decision: ConsentDecision): Promise<void> {
    if (!pending) return;
    setSubmitting(true);
    await window.electronAPI.invoke(IPC_CHANNELS.CONSENT_RESPOND, {
      runId: pending.runId,
      toolCallId: pending.toolCallId,
      toolName: pending.toolName,
      decision,
    });
    setPending(null);
    setSubmitting(false);
  }

  return (
    <div className="consent-modal__backdrop" role="presentation">
      <div className="consent-modal" role="dialog" aria-modal="true" aria-label="Tool consent request">
        <h2 className="consent-modal__title">{pending.toolName}</h2>
        <p className="consent-modal__description">
          The agent wants to run <strong>{pending.toolName}</strong> with the following arguments:
        </p>
        <pre className="consent-modal__preview">{formatArgumentPreview(pending.input)}</pre>
        <div className="consent-modal__actions">
          <button type="button" disabled={submitting} onClick={() => void respond('accept-once')}>
            Accept once
          </button>
          <button type="button" disabled={submitting} onClick={() => void respond('accept-always')}>
            Accept always
          </button>
          <button type="button" disabled={submitting} onClick={() => void respond('decline')}>
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
