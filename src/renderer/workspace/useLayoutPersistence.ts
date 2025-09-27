import { useEffect } from 'react';
import type { DockviewApi } from 'dockview-react';
import { IPC_CHANNELS } from '@shared/ipc/channels';

const DEBOUNCE_MS = 300;

/**
 * Serializes `api`'s layout on every change, debounced, and persists it to
 * disk through the `layout:save` channel keyed by `workspaceId`.
 */
export function persistLayoutOnChange(api: DockviewApi, workspaceId: string): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const disposable = api.onDidLayoutChange(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const layout = api.toJSON();
      void window.electronAPI.invoke(IPC_CHANNELS.LAYOUT_SAVE, { workspaceId, layout });
    }, DEBOUNCE_MS);
  });

  return () => {
    clearTimeout(timer);
    disposable.dispose();
  };
}

/**
 * React hook wiring `persistLayoutOnChange` to the component lifecycle:
 * attaches once `api` becomes available and tears down on unmount.
 */
export function useLayoutPersistence(api: DockviewApi | undefined, workspaceId: string): void {
  useEffect(() => {
    if (!api) return;
    return persistLayoutOnChange(api, workspaceId);
  }, [api, workspaceId]);
}
