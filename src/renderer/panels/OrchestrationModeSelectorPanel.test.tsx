import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import OrchestrationModeSelectorPanel from './OrchestrationModeSelectorPanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function stubElectronAPI() {
  const agents = [
    { id: 'architect', displayName: 'Architect' },
    { id: 'developer', displayName: 'Developer' },
  ];
  const invoke = vi.fn(async (channel: string) => {
    if (channel === 'agent:list') return { ok: true, data: { agents } };
    throw new Error(`unexpected channel ${channel}`);
  });
  (window as unknown as { electronAPI: { invoke: typeof invoke } }).electronAPI = { invoke };
  return invoke;
}

describe('OrchestrationModeSelectorPanel', () => {
  it('lists every configured agent as a selectable checkbox', async () => {
    stubElectronAPI();
    render(<OrchestrationModeSelectorPanel />);

    await waitFor(() => expect(screen.getByText('Architect')).toBeTruthy());
    expect(screen.getByText('Developer')).toBeTruthy();
  });

  it('adds an agent to the ordering list when selected', async () => {
    stubElectronAPI();
    render(<OrchestrationModeSelectorPanel />);

    await waitFor(() => expect(screen.getByText('Architect')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Architect'));

    const order = screen.getByTestId('agent-order');
    expect(order.textContent).toContain('architect');
  });

  it('reorders selected agents with the up/down controls', async () => {
    stubElectronAPI();
    render(<OrchestrationModeSelectorPanel />);

    await waitFor(() => expect(screen.getByText('Architect')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Architect'));
    fireEvent.click(screen.getByLabelText('Developer'));

    let order = screen.getByTestId('agent-order');
    expect(order.querySelectorAll('li')[0]?.textContent).toContain('architect');

    fireEvent.click(screen.getByLabelText('move developer up'));

    order = screen.getByTestId('agent-order');
    expect(order.querySelectorAll('li')[0]?.textContent).toContain('developer');
  });

  it('shows review-critique specific fields only for that mode', async () => {
    stubElectronAPI();
    render(<OrchestrationModeSelectorPanel />);

    expect(screen.queryByText('Max rounds')).toBeNull();
    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'review-critique' } });
    expect(screen.getByText('Max rounds')).toBeTruthy();
  });

  it('shows swarm specific fields only for that mode', async () => {
    stubElectronAPI();
    render(<OrchestrationModeSelectorPanel />);

    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'swarm' } });
    expect(screen.getByText('Max turns')).toBeTruthy();
    expect(screen.getByText('Stall window')).toBeTruthy();
  });

  it('calls onStart with the assembled request, including parsed parallel criteria', async () => {
    stubElectronAPI();
    const onStart = vi.fn();
    render(<OrchestrationModeSelectorPanel params={{ onStart }} />);

    await waitFor(() => expect(screen.getByText('Architect')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Architect'));
    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'parallel' } });
    fireEvent.change(screen.getByPlaceholderText('comma separated'), {
      target: { value: 'correctness, brevity' },
    });
    fireEvent.change(screen.getByLabelText('Task description'), { target: { value: 'do the task' } });

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    expect(onStart).toHaveBeenCalledWith({
      modeId: 'parallel',
      agentIds: ['architect'],
      taskDescription: 'do the task',
      config: { criteria: ['correctness', 'brevity'] },
    });
  });

  it('disables Start until at least one agent is selected', () => {
    stubElectronAPI();
    render(<OrchestrationModeSelectorPanel />);
    expect((screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
