import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import McpServerManagerPanel from './McpServerManagerPanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function stubElectronAPI() {
  let servers = [
    {
      config: {
        id: 'server-1',
        displayName: 'Echo Server',
        enabled: true,
        transport: 'stdio',
        command: 'echo-mcp',
        consentOverrides: {},
      },
      health: { connectorId: 'server-1', state: 'running', consecutiveFailures: 0 },
    },
  ];

  const invoke = vi.fn(async (channel: string, payload: unknown) => {
    if (channel === 'mcp:server-list') return { ok: true, data: { servers } };
    if (channel === 'mcp:server-set-enabled') {
      const { id, enabled } = payload as { id: string; enabled: boolean };
      servers = servers.map((s) =>
        s.config.id === id
          ? { config: { ...s.config, enabled }, health: { ...s.health, state: enabled ? 'running' : 'stopped' } }
          : s,
      );
      return { ok: true, data: { config: servers.find((s) => s.config.id === id)?.config ?? null } };
    }
    if (channel === 'mcp:server-delete') {
      const { id } = payload as { id: string };
      servers = servers.filter((s) => s.config.id !== id);
      return { ok: true, data: { deleted: true } };
    }
    if (channel === 'mcp:server-upsert') {
      const { config } = payload as { config: (typeof servers)[number]['config'] };
      servers = [...servers, { config, health: { connectorId: config.id, state: 'running', consecutiveFailures: 0 } }];
      return { ok: true, data: { config } };
    }
    if (channel === 'mcp:server-inspect') {
      return { ok: true, data: { tools: [{ name: 'echo', description: 'echoes text' }], resources: [] } };
    }
    if (channel === 'mcp:server-set-tool-consent') {
      const { id, toolName, policy } = payload as { id: string; toolName: string; policy: string };
      servers = servers.map((s) =>
        s.config.id === id
          ? { ...s, config: { ...s.config, consentOverrides: { ...s.config.consentOverrides, [toolName]: policy } } }
          : s,
      );
      return { ok: true, data: { config: servers.find((s) => s.config.id === id)?.config ?? null } };
    }
    throw new Error(`unexpected channel ${channel}`);
  });

  (window as unknown as { electronAPI: { invoke: typeof invoke } }).electronAPI = { invoke };
  return invoke;
}

describe('McpServerManagerPanel', () => {
  it('lists configured servers with their transport and health', async () => {
    stubElectronAPI();
    render(<McpServerManagerPanel />);

    await waitFor(() => expect(screen.getByText('Echo Server')).toBeTruthy());
    expect(screen.getByTestId('transport-server-1').textContent).toBe('stdio');
    expect(screen.getByTestId('status-server-1').textContent).toBe('running');
  });

  it('adds a new server', async () => {
    const invoke = stubElectronAPI();
    render(<McpServerManagerPanel />);
    await waitFor(() => expect(screen.getByText('Echo Server')).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText('Display name'), { target: { value: 'New Server' } });
    fireEvent.change(screen.getByPlaceholderText('Command'), { target: { value: 'new-mcp' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }));

    await waitFor(() => expect(screen.getByText('New Server')).toBeTruthy());
    expect(invoke).toHaveBeenCalledWith(
      'mcp:server-upsert',
      expect.objectContaining({ config: expect.objectContaining({ displayName: 'New Server', command: 'new-mcp' }) }),
    );
  });

  it('disables and re-enables a server', async () => {
    stubElectronAPI();
    render(<McpServerManagerPanel />);
    await waitFor(() => expect(screen.getByText('Echo Server')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
    await waitFor(() => expect(screen.getByTestId('status-server-1').textContent).toBe('stopped'));
    expect(screen.getByRole('button', { name: 'Enable' })).toBeTruthy();
  });

  it('removes a server', async () => {
    stubElectronAPI();
    render(<McpServerManagerPanel />);
    await waitFor(() => expect(screen.getByText('Echo Server')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.queryByText('Echo Server')).toBeNull());
  });

  it('inspects a server and shows its discovered tools', async () => {
    stubElectronAPI();
    render(<McpServerManagerPanel />);
    await waitFor(() => expect(screen.getByText('Echo Server')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Inspect' }));
    await waitFor(() => expect(screen.getByTestId('tool-echo')).toBeTruthy());
  });

  it('sets a per-tool consent override', async () => {
    const invoke = stubElectronAPI();
    render(<McpServerManagerPanel />);
    await waitFor(() => expect(screen.getByText('Echo Server')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Inspect' }));
    await waitFor(() => expect(screen.getByTestId('consent-echo')).toBeTruthy());

    fireEvent.change(screen.getByTestId('consent-echo'), { target: { value: 'always' } });

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('mcp:server-set-tool-consent', {
        id: 'server-1',
        toolName: 'echo',
        policy: 'always',
      }),
    );
  });
});
