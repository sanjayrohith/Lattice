import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AgentRosterPanel from './AgentRosterPanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function stubElectronAPI() {
  const agents = [
    {
      id: 'agent-1',
      displayName: 'Coder',
      backend: { kind: 'acp', connectorId: 'codex-cli' },
      systemPrompt: 'You write code.',
      stepBudget: 25,
      role: 'worker',
    },
    {
      id: 'agent-2',
      displayName: 'Assistant',
      backend: { kind: 'sdk', modelConfig: { providerId: 'openai', modelId: 'gpt-4o' } },
      systemPrompt: '',
      stepBudget: 10,
      role: 'worker',
    },
  ];
  const connectors = [
    {
      config: { id: 'codex-cli', displayName: 'Codex CLI', transport: 'stdio', enabled: true },
      health: { connectorId: 'codex-cli', state: 'running' },
    },
  ];

  const invoke = vi.fn(async (channel: string, payload: unknown) => {
    if (channel === 'agent:list') return { ok: true, data: { agents } };
    if (channel === 'acp:connector-list') return { ok: true, data: { connectors } };
    if (channel === 'agent:update') {
      const { id, patch } = payload as { id: string; patch: Record<string, unknown> };
      const agent = agents.find((a) => a.id === id);
      if (agent) Object.assign(agent, patch);
      return { ok: true, data: { agent: agent ?? null } };
    }
    throw new Error(`unexpected channel ${channel}`);
  });

  (window as unknown as { electronAPI: { invoke: typeof invoke } }).electronAPI = { invoke };
  return invoke;
}

describe('AgentRosterPanel', () => {
  it('lists agents with a backend badge and derived availability', async () => {
    stubElectronAPI();
    render(<AgentRosterPanel />);

    await waitFor(() => expect(screen.getByTestId('backend-agent-1').textContent).toBe('codex-cli'));
    expect(screen.getByTestId('availability-agent-1').textContent).toBe('available');

    expect(screen.getByTestId('backend-agent-2').textContent).toBe('gpt-4o');
    expect(screen.getByTestId('availability-agent-2').textContent).toBe('available');
  });

  it('edits and saves a display name inline', async () => {
    const invoke = stubElectronAPI();
    render(<AgentRosterPanel />);

    await waitFor(() => expect(screen.getByText('Coder')).toBeTruthy());
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0] as HTMLElement);

    const input = screen.getByLabelText('Coder display name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Senior Coder' } });

    const row = input.closest('li');
    if (!row) throw new Error('expected row');
    fireEvent.click(within(row).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('agent:update', {
        id: 'agent-1',
        patch: { displayName: 'Senior Coder', systemPrompt: 'You write code.', stepBudget: 25, role: 'worker' },
      }),
    );
    await waitFor(() => expect(screen.getByText('Senior Coder')).toBeTruthy());
  });

  it('cancels editing without saving', async () => {
    const invoke = stubElectronAPI();
    render(<AgentRosterPanel />);

    await waitFor(() => expect(screen.getByText('Coder')).toBeTruthy());
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0] as HTMLElement);
    const input = screen.getByLabelText('Coder display name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Should not save' } });

    const row = input.closest('li');
    if (!row) throw new Error('expected row');
    fireEvent.click(within(row).getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Coder')).toBeTruthy();
    expect(invoke).not.toHaveBeenCalledWith('agent:update', expect.anything());
  });

  it('shows unavailable for an acp agent whose connector is not running', async () => {
    const agents = [
      { id: 'agent-3', displayName: 'Broken', backend: { kind: 'acp', connectorId: 'dead-cli' }, systemPrompt: '', stepBudget: 5, role: 'worker' },
    ];
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'agent:list') return { ok: true, data: { agents } };
      if (channel === 'acp:connector-list') return { ok: true, data: { connectors: [] } };
      throw new Error('unexpected');
    });
    (window as unknown as { electronAPI: { invoke: typeof invoke } }).electronAPI = { invoke };

    render(<AgentRosterPanel />);
    await waitFor(() => expect(screen.getByTestId('availability-agent-3').textContent).toBe('checking'));
  });
});
