import type { DockviewApi } from 'dockview-react';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { applyDefaultLayout } from './defaultLayout';

/**
 * Loads the persisted layout for `workspaceId` and hydrates `api` from it.
 * Falls back to the default workspace preset when nothing has been
 * persisted yet, the load request fails, or the stored JSON is no longer a
 * valid Dockview layout (e.g. after a panel was renamed or removed).
 */
export async function hydrateLayout(api: DockviewApi, workspaceId: string): Promise<void> {
  const result = await window.electronAPI.invoke(IPC_CHANNELS.LAYOUT_LOAD, { workspaceId });

  if (result.ok && result.data.layout) {
    try {
      api.fromJSON(result.data.layout as Parameters<DockviewApi['fromJSON']>[0]);
      return;
    } catch {
      // Stored layout no longer matches the current panel registry; fall
      // through to the default preset rather than leaving a blank surface.
    }
  }

  applyDefaultLayout(api);
}
