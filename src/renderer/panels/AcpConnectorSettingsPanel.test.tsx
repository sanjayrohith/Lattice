import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AcpConnectorSettingsPanel from './AcpConnectorSettingsPanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function stubElectronAPI() {
  const connectors: {
    config: { id: string; displayName: string; transport: 'stdio'; enabled: boolean };
    health: { connectorId: string; state: string; consecutiveFailures: number };
  }[] = [
    {
      config: { id: 'codex-cli', displayName: 'Codex CLI', transport: 'stdio', enabled: true },
      health: { connectorId: 'codex-cli', state: 'stopped', consecutiveFailures: 0 },
    },
    {
      config: { id: 'gemini-cli', displayName: 'Gemini CLI', transport: 'stdio', enabled: false },
      health: { connectorId: 'gemini-cli', state: 'stopped', consecutiveFailures: 0 },
    },
  ];

  const invoke = vi.fn(async (channel: string, payload: unknown) => {
    if (channel === 'acp:connector-list') {
      return { ok: true, data: { connectors } };
    }
    if (channel === 'acp:connector-set-enabled') {
      const { id, enabled } = payload as { id: string; enabled: boolean };
      const entry = connectors.find((c) => c.config.id === id);
      if (entry) entry.config.enabled = enabled;
      return { ok: true, data: { config: entry?.config ?? null } };
    }
    if (channel === 'acp:connector-test') {
      const { id } = payload as { id: string };
      const entry = connectors.find((c) => c.config.id === id);
      if (entry) entry.health.state = 'running';
      return { ok: true, data: { ok: true } };
    }
    throw new Error(`unexpected channel ${channel}`);
  });

  (window as unknown as { electronAPI: { invoke: typeof invoke } }).electronAPI = { invoke };
  return invoke;
}

describe('AcpConnectorSettingsPanel', () => {
  it('lists every configured connector with its transport and health', async () => {
    stubElectronAPI();
    render(<AcpConnectorSettingsPanel />);

    await waitFor(() => expect(screen.getByTestId('status-codex-cli').textContent).toBe('stopped'));
    expect(screen.getByTestId('transport-codex-cli').textContent).toBe('stdio');
    expect(screen.getByTestId('status-gemini-cli').textContent).toBe('stopped');
  });

  it('toggles a connector enabled state', async () => {
    const invoke = stubElectronAPI();
    render(<AcpConnectorSettingsPanel />);

    await waitFor(() => expect(screen.getByTestId('status-gemini-cli').textContent).toBe('stopped'));
    const status = screen.getByTestId('status-gemini-cli');
    const row = status.closest('li');
    if (!row) throw new Error('expected row');
    fireEvent.click(within(row).getByRole('button', { name: 'Enable' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('acp:connector-set-enabled', { id: 'gemini-cli', enabled: true }),
    );
  });

  it('tests a connector connection and reports the result', async () => {
    stubElectronAPI();
    render(<AcpConnectorSettingsPanel />);

    await waitFor(() => expect(screen.getByTestId('status-codex-cli').textContent).toBe('stopped'));
    const status = screen.getByTestId('status-codex-cli');
    const row = status.closest('li');
    if (!row) throw new Error('expected row');
    fireEvent.click(within(row).getByRole('button', { name: 'Test connection' }));

    await waitFor(() => expect(screen.getByTestId('test-result-codex-cli').textContent).toBe('Connected'));
  });
});
