import { useCallback } from 'react';
import { DockviewReact, type DockviewReadyEvent } from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import { panelRegistry } from './panelRegistry';

export interface DockviewShellProps {
  onReady?: (event: DockviewReadyEvent) => void;
}

/**
 * Renders the central Dockview surface, resolving panel `component` ids
 * through the shared `panelRegistry` so any panel can be added to a layout
 * by id alone.
 */
export function DockviewShell({ onReady }: DockviewShellProps): React.JSX.Element {
  const handleReady = useCallback(
    (event: DockviewReadyEvent) => {
      onReady?.(event);
    },
    [onReady],
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
