import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DelegationTreePanel from './DelegationTreePanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function stubElectronAPI() {
  const nodes = [
    { runId: 'root', parentRunId: null, agentId: 'orchestrator', status: 'running', startedAt: Date.now() - 5000, completedAt: null, totalTokens: 120 },
    { runId: 'child', parentRunId: 'root', agentId: 'coder', status: 'completed', startedAt: Date.now() - 3000, completedAt: Date.now() - 1000, totalTokens: 80 },
  ];
  const invoke = vi.fn(async (channel: string) => {
    if (channel === 'orchestrator:delegation-tree') return { ok: true, data: { nodes } };
    throw new Error(`unexpected channel ${channel}`);
  });
  (window as unknown as { electronAPI: { invoke: typeof invoke } }).electronAPI = { invoke };
  return invoke;
}

describe('DelegationTreePanel', () => {
  it('shows an empty state with no root run selected', () => {
    render(<DelegationTreePanel />);
    expect(screen.getByText('No active run selected.')).toBeTruthy();
  });

  it('renders every node with its status and token cost', async () => {
    stubElectronAPI();
    render(<DelegationTreePanel params={{ rootRunId: 'root' }} />);

    await waitFor(() => expect(screen.getByTestId('status-root').textContent).toBe('running'));
    expect(screen.getByTestId('tokens-root').textContent).toBe('120 tokens');
    expect(screen.getByTestId('status-child').textContent).toBe('completed');
    expect(screen.getByTestId('tokens-child').textContent).toBe('80 tokens');
  });

  it('invokes onOpenTranscript when a node is clicked', async () => {
    stubElectronAPI();
    const onOpenTranscript = vi.fn();
    render(<DelegationTreePanel params={{ rootRunId: 'root', onOpenTranscript }} />);

    await waitFor(() => expect(screen.getByText('coder')).toBeTruthy());
    fireEvent.click(screen.getByText('coder'));

    expect(onOpenTranscript).toHaveBeenCalledWith('child');
  });
});
