import { useCallback } from 'react';
import { DockviewReact, type DockviewReadyEvent } from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';

const emptyComponents = {};

export interface DockviewShellProps {
  onReady?: (event: DockviewReadyEvent) => void;
}

/**
 * Renders the central Dockview surface. Panel components are supplied by
 * the panel registry (wired in a later step); for now the surface mounts
 * empty so the layout chrome, theming, and `onReady` wiring can be
 * validated independently of any concrete panel.
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
      <DockviewReact className="dockview-theme-lattice" components={emptyComponents} onReady={handleReady} />
    </div>
  );
}
