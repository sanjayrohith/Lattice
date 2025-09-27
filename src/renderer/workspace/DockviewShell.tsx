import { useCallback } from 'react';
import { DockviewReact, type DockviewReadyEvent } from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import { panelRegistry } from './panelRegistry';
import { applyDefaultLayout } from './defaultLayout';

export interface DockviewShellProps {
  onReady?: (event: DockviewReadyEvent) => void;
  /** Skips applying the default layout preset; used by tests and future layout restoration. */
  skipDefaultLayout?: boolean;
}

/**
 * Renders the central Dockview surface, resolving panel `component` ids
 * through the shared `panelRegistry` so any panel can be added to a layout
 * by id alone. Applies the default workspace preset once the Dockview api
 * becomes available.
 */
export function DockviewShell({
  onReady,
  skipDefaultLayout = false,
}: DockviewShellProps): React.JSX.Element {
  const handleReady = useCallback(
    (event: DockviewReadyEvent) => {
      if (!skipDefaultLayout) {
        applyDefaultLayout(event.api);
      }
      onReady?.(event);
    },
    [onReady, skipDefaultLayout],
  );

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
