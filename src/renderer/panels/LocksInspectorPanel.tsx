import { useCallback, useEffect, useState } from 'react';
import { IPC_CHANNELS } from '@shared/ipc/channels';

interface LockRecord {
  path: string;
  runId: string;
  agentId: string;
  acquiredAt: number;
}

function holdDurationLabel(acquiredAt: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - acquiredAt) / 1000));
  return `${seconds}s`;
}

/**
 * Lists every currently held file lock with its owning agent and run,
 * the path it holds, and how long it has held it — refreshed on a
 * poll rather than a push subscription, since locks change frequently
 * enough that a dedicated event channel would be overkill for an
 * inspector panel. A manual "Force release" action bypasses the
 * owner entirely, for the rare case a lock is stuck.
 */
export default function LocksInspectorPanel(): React.JSX.Element {
  const [locks, setLocks] = useState<readonly LockRecord[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [pendingPath, setPendingPath] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.invoke(IPC_CHANNELS.LOCKS_LIST, undefined);
    if (result.ok && Array.isArray(result.data.locks)) {
      setLocks(result.data.locks as LockRecord[]);
    }
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;
    let cancelled = false;

    void window.electronAPI.invoke(IPC_CHANNELS.LOCKS_LIST, undefined).then((result) => {
      if (!cancelled && result.ok && Array.isArray(result.data.locks)) {
        setLocks(result.data.locks as LockRecord[]);
      }
    });

    const interval = setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refresh]);

  async function handleForceRelease(path: string): Promise<void> {
    setPendingPath(path);
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.LOCKS_FORCE_RELEASE, { path });
      await refresh();
    } finally {
      setPendingPath(undefined);
    }
  }

  return (
    <div className="panel panel--locks-inspector">
      <h2 className="locks-inspector__heading">Active Locks</h2>
      {locks.length === 0 ? (
        <p className="locks-inspector__empty">No locks currently held.</p>
      ) : (
        <ul className="locks-inspector__list">
          {locks.map((lock) => (
            <li key={lock.path} className="locks-inspector__row">
              <span className="locks-inspector__path">{lock.path}</span>
              <span className="locks-inspector__agent">{lock.agentId}</span>
              <span data-testid={`duration-${lock.path}`} className="locks-inspector__duration">
                {holdDurationLabel(lock.acquiredAt, now)}
              </span>
              <button
                type="button"
                disabled={pendingPath === lock.path}
                onClick={() => void handleForceRelease(lock.path)}
              >
                Force release
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
