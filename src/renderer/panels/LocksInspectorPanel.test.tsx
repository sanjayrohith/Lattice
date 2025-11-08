import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import LocksInspectorPanel from './LocksInspectorPanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function stubElectronAPI(initialLocks: { path: string; runId: string; agentId: string; acquiredAt: number }[]) {
  const state = { locks: initialLocks };
  const invoke = vi.fn(async (channel: string, payload: unknown) => {
    if (channel === 'locks:list') return { ok: true, data: { locks: state.locks } };
    if (channel === 'locks:force-release') {
      const { path } = payload as { path: string };
      const before = state.locks.length;
      state.locks = state.locks.filter((l) => l.path !== path);
      return { ok: true, data: { released: state.locks.length < before } };
    }
    throw new Error(`unexpected channel ${channel}`);
  });
  (window as unknown as { electronAPI: { invoke: typeof invoke } }).electronAPI = { invoke };
  return invoke;
}

describe('LocksInspectorPanel', () => {
  it('shows an empty state when no locks are held', async () => {
    stubElectronAPI([]);
    render(<LocksInspectorPanel />);
    await waitFor(() => expect(screen.getByText('No locks currently held.')).toBeTruthy());
  });

  it('lists every held lock with its agent and path', async () => {
    stubElectronAPI([{ path: '/ws/a.txt', runId: 'run-1', agentId: 'coder', acquiredAt: Date.now() }]);
    render(<LocksInspectorPanel />);

    await waitFor(() => expect(screen.getByText('/ws/a.txt')).toBeTruthy());
    expect(screen.getByText('coder')).toBeTruthy();
  });

  it('force-releases a lock and removes it from the list', async () => {
    stubElectronAPI([{ path: '/ws/a.txt', runId: 'run-1', agentId: 'coder', acquiredAt: Date.now() }]);
    render(<LocksInspectorPanel />);

    await waitFor(() => expect(screen.getByText('/ws/a.txt')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Force release' }));

    await waitFor(() => expect(screen.getByText('No locks currently held.')).toBeTruthy());
  });
});
