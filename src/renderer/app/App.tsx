import type { JSX } from 'react';

import { TitleBar } from '../shell/TitleBar';
import { StatusBar } from '../shell/StatusBar';
import { UpdatePrompt } from '../shell/UpdatePrompt';
import { DockviewShell } from '../workspace/DockviewShell';
import { useIpcHydration } from '../state/ipcHydration';
import { ConsentModal } from '../consent/ConsentModal';
import '../workspace/dockviewTheme.css';

export function App(): JSX.Element {
  useIpcHydration();

  return (
    <div className="app-shell">
      <TitleBar />
      <main className="app-shell__content app-shell__content--dockview">
        <DockviewShell />
      </main>
      <StatusBar />
      <ConsentModal />
      <UpdatePrompt />
    </div>
  );
}
