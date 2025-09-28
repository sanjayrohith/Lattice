import type { IDockviewPanel } from 'dockview-react';
import { IPC_CHANNELS } from '@shared/ipc/channels';

/**
 * Promotes a docked panel into a native `BrowserWindow`: asks the main
 * process to open the popout window for this panel's id, and — once that
 * succeeds — removes the panel from the Dockview surface so it unmounts
 * here and remounts exclusively inside the new window.
 */
export async function promotePanelToNativeWindow(panel: IDockviewPanel): Promise<void> {
  const result = await window.electronAPI.invoke(IPC_CHANNELS.WINDOW_POPOUT, {
    panelId: panel.id,
  });

  if (result.ok) {
    panel.api.close();
  } else {
    console.error(`[workspace] failed to pop out panel "${panel.id}": ${result.error.message}`);
  }
}
