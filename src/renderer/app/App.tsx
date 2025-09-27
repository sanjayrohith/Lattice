import type { JSX } from 'react';

import { TitleBar } from '../shell/TitleBar';
import { StatusBar } from '../shell/StatusBar';

export function App(): JSX.Element {
  return (
    <div className="app-shell">
      <TitleBar />
      <main className="app-shell__content">
        <h1>Lattice</h1>
      </main>
      <StatusBar />
    </div>
  );
}
