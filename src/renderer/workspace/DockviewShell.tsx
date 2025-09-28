import { useCallback, useState } from 'react';
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type GetTabContextMenuItemsParams,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import { panelRegistry } from './panelRegistry';
import { resetLayout } from './defaultLayout';
import { hydrateLayout } from './hydrateLayout';
import { useLayoutPersistence } from './useLayoutPersistence';

export interface DockviewShellProps {
  onReady?: (event: DockviewReadyEvent) => void;
  /** Skips hydrating/applying any layout; used by tests that assert on a bare surface. */
  skipDefaultLayout?: boolean;
  /** Identifies which persisted layout this surface reads from and writes to. */
  workspaceId?: string;
}

export function getTabContextMenuItems(_params: GetTabContextMenuItemsParams) {
  return ['float' as const, 'separator' as const, 'close' as const];
}

/**
 * Renders the central Dockview surface, resolving panel `component` ids
 * through the shared `panelRegistry` so any panel can be added to a layout
 * by id alone. On mount, hydrates from the persisted layout for
 * `workspaceId` (falling back to the default preset), persists every
 * subsequent change, and exposes a "Reset Layout" command.
 *
 * Floating groups (drag a tab out into its own window, or right-click ->
 * "Move to floating group") and edge groups (drop a panel against the
 * surface's outer edge to dock it as a collapsible strip) are both enabled.
 */
export function DockviewShell({
  onReady,
  skipDefaultLayout = false,
  workspaceId = 'default',
}: DockviewShellProps): React.JSX.Element {
  const [api, setApi] = useState<DockviewApi | undefined>(undefined);

  const handleReady = useCallback(
    (event: DockviewReadyEvent) => {
      if (!skipDefaultLayout) {
        void hydrateLayout(event.api, workspaceId);
      }
      setApi(event.api);
      onReady?.(event);
    },
    [onReady, skipDefaultLayout, workspaceId],
  );

  useLayoutPersistence(api, workspaceId);

  return (
    <div className="dockview-shell">
      <div className="dockview-shell__toolbar">
        <button
          type="button"
          className="dockview-shell__reset-button"
          disabled={!api}
          onClick={() => api && resetLayout(api)}
        >
          Reset Layout
        </button>
      </div>
      <DockviewReact
        className="dockview-theme-lattice"
        components={panelRegistry}
        onReady={handleReady}
        disableFloatingGroups={false}
        dockToEdgeGroups={true}
        autoHideEdgeGroups={true}
        getTabContextMenuItems={getTabContextMenuItems}
      />
    </div>
  );
}
