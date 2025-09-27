import { useCallback, useState } from 'react';
import { DockviewReact, type DockviewApi, type DockviewReadyEvent } from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import { panelRegistry } from './panelRegistry';
import { applyDefaultLayout } from './defaultLayout';
import { useLayoutPersistence } from './useLayoutPersistence';

export interface DockviewShellProps {
  onReady?: (event: DockviewReadyEvent) => void;
  /** Skips applying the default layout preset; used by tests and future layout restoration. */
  skipDefaultLayout?: boolean;
  /** Identifies which persisted layout this surface reads from and writes to. */
  workspaceId?: string;
}

/**
 * Renders the central Dockview surface, resolving panel `component` ids
 * through the shared `panelRegistry` so any panel can be added to a layout
 * by id alone. Applies the default workspace preset once the Dockview api
 * becomes available, and persists every subsequent layout change.
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
        applyDefaultLayout(event.api);
      }
      setApi(event.api);
      onReady?.(event);
    },
    [onReady, skipDefaultLayout],
  );

  useLayoutPersistence(api, workspaceId);

  return (
    <div className="dockview-shell">
      <DockviewReact
        className="dockview-theme-lattice"
        components={panelRegistry}
        onReady={handleReady}
      />
    </div>
  );
}
