import { useEffect, useState } from 'react';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { UpdateAvailableEvent } from '@shared/ipc/events';

/**
 * Listens for `update:available` broadcasts and renders a dismissible
 * banner prompting the user to restart into an already-downloaded
 * update. Never appears at all unless the main process actually
 * broadcasts — which it only does when `autoUpdateEnabled` was on at
 * download time — so this component itself needs no preference check.
 */
export function UpdatePrompt(): React.JSX.Element | null {
  const [pending, setPending] = useState<UpdateAvailableEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const unsubscribe = window.electronAPI.subscribe(IPC_CHANNELS.UPDATE_AVAILABLE, (event) => {
      setPending(event);
      setDismissed(false);
    });
    return unsubscribe;
  }, []);

  if (!pending || dismissed) return null;

  async function handleRestart(): Promise<void> {
    setInstalling(true);
    await window.electronAPI.invoke(IPC_CHANNELS.UPDATE_INSTALL, undefined);
  }

  return (
    <div className="update-prompt" role="status">
      <span className="update-prompt__message">
        Version {pending.version} is ready — restart to update.
      </span>
      <button type="button" disabled={installing} onClick={() => void handleRestart()}>
        Restart now
      </button>
      <button type="button" disabled={installing} onClick={() => setDismissed(true)}>
        Later
      </button>
    </div>
  );
}
