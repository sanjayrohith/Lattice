import { Suspense } from 'react';
import { isPanelId, popoutPanelComponents } from '../workspace/popoutPanelComponents';
import { TitleBar } from '../shell/TitleBar';

export interface PopoutRoute {
  panelId: string;
}

/** Parses `#/popout/<panelId>?<query>` into its panel id. Returns `undefined` for any other hash. */
export function parsePopoutRoute(hash: string): PopoutRoute | undefined {
  const match = /^#\/popout\/([^?]+)/.exec(hash);
  if (!match?.[1]) return undefined;
  return { panelId: decodeURIComponent(match[1]) };
}

export interface PopoutAppProps {
  hash: string;
}

/**
 * Renders a single panel, promoted out of Dockview into its own native
 * window, identified by the route hash the main process attached when it
 * created the popout `BrowserWindow`.
 */
export function PopoutApp({ hash }: PopoutAppProps): React.JSX.Element {
  const route = parsePopoutRoute(hash);

  if (!route || !isPanelId(route.panelId)) {
    return (
      <div className="app-shell">
        <TitleBar />
        <main className="app-shell__content">
          <p>Unknown panel: {route?.panelId ?? hash}</p>
        </main>
      </div>
    );
  }

  const PanelComponent = popoutPanelComponents[route.panelId];

  return (
    <div className="app-shell">
      <TitleBar />
      <main className="app-shell__content">
        <Suspense fallback={<div>Loading…</div>}>
          <PanelComponent />
        </Suspense>
      </main>
    </div>
  );
}
