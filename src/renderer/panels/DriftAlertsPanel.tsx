import { useCallback, useEffect, useState } from 'react';
import { IPC_CHANNELS } from '@shared/ipc/channels';

interface DriftSignal {
  path: string;
  diverged: boolean;
  score: number;
  baselineContent: string;
  currentContent: string;
}

export interface DriftAlertsPanelParams {
  runId?: string;
}

/**
 * Polls for the run's latest drift divergence signals and renders an
 * alert for each diverged file: its score, and a simple line-count
 * diff summary between the baseline and current content. "Accept"
 * rebases the baseline to the current content (the divergence stops
 * being flagged, since it is now considered intentional); "Revert"
 * writes the baseline's original content back to disk, undoing the
 * divergence. Only diverged files are rendered — an unchanged file
 * covered by the same baseline generates no alert.
 */
export default function DriftAlertsPanel(props: { params?: DriftAlertsPanelParams } = {}): React.JSX.Element {
  const runId = props.params?.runId;
  const [signals, setSignals] = useState<readonly DriftSignal[]>([]);
  const [pendingPath, setPendingPath] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (!runId || !window.electronAPI) return;
    const result = await window.electronAPI.invoke(IPC_CHANNELS.DRIFT_SIGNALS, { runId });
    if (result.ok && Array.isArray(result.data.signals)) {
      setSignals((result.data.signals as DriftSignal[]).filter((s) => s.diverged));
    }
  }, [runId]);

  useEffect(() => {
    if (!runId || !window.electronAPI) return;
    let cancelled = false;

    void window.electronAPI.invoke(IPC_CHANNELS.DRIFT_SIGNALS, { runId }).then((result) => {
      if (!cancelled && result.ok && Array.isArray(result.data.signals)) {
        setSignals((result.data.signals as DriftSignal[]).filter((s) => s.diverged));
      }
    });

    const interval = setInterval(() => void refresh(), 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [runId, refresh]);

  async function handleAccept(path: string): Promise<void> {
    if (!runId) return;
    setPendingPath(path);
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.DRIFT_ACCEPT, { runId, path });
      await refresh();
    } finally {
      setPendingPath(undefined);
    }
  }

  async function handleRevert(path: string): Promise<void> {
    if (!runId) return;
    setPendingPath(path);
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.DRIFT_REVERT, { runId, path });
      await refresh();
    } finally {
      setPendingPath(undefined);
    }
  }

  return (
    <div className="panel panel--drift-alerts">
      <h2 className="drift-alerts__heading">Drift Alerts</h2>
      {!runId ? (
        <p className="drift-alerts__empty">No active run selected.</p>
      ) : signals.length === 0 ? (
        <p className="drift-alerts__empty">No divergence detected.</p>
      ) : (
        <ul className="drift-alerts__list">
          {signals.map((signal) => {
            const busy = pendingPath === signal.path;
            const baselineLines = signal.baselineContent.split('\n').length;
            const currentLines = signal.currentContent.split('\n').length;

            return (
              <li key={signal.path} className="drift-alerts__row">
                <span className="drift-alerts__path">{signal.path}</span>
                <span data-testid={`score-${signal.path}`} className="drift-alerts__score">
                  {signal.score.toFixed(2)}
                </span>
                <pre data-testid={`diff-${signal.path}`} className="drift-alerts__diff">
                  {`-${baselineLines} lines (baseline)\n+${currentLines} lines (current)`}
                </pre>
                <button type="button" disabled={busy} onClick={() => void handleAccept(signal.path)}>
                  Accept
                </button>
                <button type="button" disabled={busy} onClick={() => void handleRevert(signal.path)}>
                  Revert
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
