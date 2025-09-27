import { useEffect, useState } from 'react';
import { IPC_CHANNELS } from '@shared/ipc/channels';

export type ConnectionState = 'connected' | 'connecting' | 'disconnected';

export interface StatusBarProps {
  connectionState?: ConnectionState;
  activeRunCount?: number;
}

export function StatusBar({
  connectionState = 'connected',
  activeRunCount = 0,
}: StatusBarProps): React.JSX.Element {
  const [appVersion, setAppVersion] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    void window.electronAPI.invoke(IPC_CHANNELS.APP_INFO, undefined).then((result) => {
      if (!cancelled && result.ok) {
        setAppVersion(result.data.appVersion);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="status-bar">
      <span className={`status-bar__connection status-bar__connection--${connectionState}`}>
        {connectionState}
      </span>
      <span className="status-bar__runs">Active runs: {activeRunCount}</span>
      <span className="status-bar__version">v{appVersion ?? '…'}</span>
    </footer>
  );
}
