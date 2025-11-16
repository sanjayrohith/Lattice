import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DriftAlertsPanel from './DriftAlertsPanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function stubElectronAPI() {
  const signals = [
    {
      path: 'a.txt',
      diverged: true,
      score: 0.5,
      baselineContent: 'one\ntwo',
      currentContent: 'one\ntwo\nthree',
    },
    { path: 'b.txt', diverged: false, score: 0, baselineContent: 'x', currentContent: 'x' },
  ];

  const invoke = vi.fn(async (channel: string, payload: unknown) => {
    if (channel === 'drift:signals') return { ok: true, data: { signals } };
    if (channel === 'drift:accept') {
      const { path } = payload as { path: string };
      const target = signals.find((s) => s.path === path);
      if (target) target.diverged = false;
      return { ok: true, data: { accepted: true } };
    }
    if (channel === 'drift:revert') {
      const { path } = payload as { path: string };
      const target = signals.find((s) => s.path === path);
      if (target) target.diverged = false;
      return { ok: true, data: { reverted: true } };
    }
    throw new Error(`unexpected channel ${channel}`);
  });

  (window as unknown as { electronAPI: { invoke: typeof invoke } }).electronAPI = { invoke };
  return invoke;
}

describe('DriftAlertsPanel', () => {
  it('shows an empty state with no run selected', () => {
    render(<DriftAlertsPanel />);
    expect(screen.getByText('No active run selected.')).toBeTruthy();
  });

  it('renders only diverged signals with their score', async () => {
    stubElectronAPI();
    render(<DriftAlertsPanel params={{ runId: 'run-1' }} />);

    await waitFor(() => expect(screen.getByText('a.txt')).toBeTruthy());
    expect(screen.getByTestId('score-a.txt').textContent).toBe('0.50');
    expect(screen.queryByText('b.txt')).toBeNull();
  });

  it('renders a diff summary for a diverged file', async () => {
    stubElectronAPI();
    render(<DriftAlertsPanel params={{ runId: 'run-1' }} />);

    await waitFor(() => expect(screen.getByText('a.txt')).toBeTruthy());
    const diff = screen.getByTestId('diff-a.txt').textContent ?? '';
    expect(diff).toContain('2 lines (baseline)');
    expect(diff).toContain('3 lines (current)');
  });

  it('accepts a divergence and removes it from the alert list', async () => {
    const invoke = stubElectronAPI();
    render(<DriftAlertsPanel params={{ runId: 'run-1' }} />);

    await waitFor(() => expect(screen.getByText('a.txt')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(screen.getByText('No divergence detected.')).toBeTruthy());
    expect(invoke).toHaveBeenCalledWith('drift:accept', { runId: 'run-1', path: 'a.txt' });
  });

  it('reverts a divergence and removes it from the alert list', async () => {
    const invoke = stubElectronAPI();
    render(<DriftAlertsPanel params={{ runId: 'run-1' }} />);

    await waitFor(() => expect(screen.getByText('a.txt')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Revert' }));

    await waitFor(() => expect(screen.getByText('No divergence detected.')).toBeTruthy());
    expect(invoke).toHaveBeenCalledWith('drift:revert', { runId: 'run-1', path: 'a.txt' });
  });
});
