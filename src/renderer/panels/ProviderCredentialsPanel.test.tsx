import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ProviderCredentialsPanel from './ProviderCredentialsPanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function stubElectronAPI(configured: string[] = []) {
  const state = { configured: new Set(configured) };
  const invoke = vi.fn(async (channel: string, payload: unknown) => {
    if (channel === 'vault:list') {
      return {
        ok: true,
        data: {
          credentials: [...state.configured].map((id) => ({
            id,
            configured: true as const,
            updatedAt: '2025-01-01T00:00:00.000Z',
          })),
        },
      };
    }
    if (channel === 'vault:set') {
      const { id } = payload as { id: string };
      state.configured.add(id);
      return { ok: true, data: undefined };
    }
    if (channel === 'vault:delete') {
      const { id } = payload as { id: string };
      const deleted = state.configured.delete(id);
      return { ok: true, data: { deleted } };
    }
    throw new Error(`unexpected channel ${channel}`);
  });

  (window as unknown as { electronAPI: { invoke: typeof invoke } }).electronAPI = { invoke };
  return invoke;
}

describe('ProviderCredentialsPanel', () => {
  it('shows not-configured status for every provider by default', async () => {
    stubElectronAPI();
    render(<ProviderCredentialsPanel />);

    await waitFor(() => expect(screen.getByTestId('status-openai').textContent).toBe('Not configured'));
    expect(screen.getByTestId('status-anthropic').textContent).toBe('Not configured');
    expect(screen.getByTestId('status-google').textContent).toBe('Not configured');
  });

  it('shows configured status for providers already in the vault', async () => {
    stubElectronAPI(['openai']);
    render(<ProviderCredentialsPanel />);

    await waitFor(() => expect(screen.getByTestId('status-openai').textContent).toBe('Configured'));
  });

  it('saves a key, clears the write-only field, and never exposes the value again', async () => {
    const invoke = stubElectronAPI();
    render(<ProviderCredentialsPanel />);

    const input = screen.getByLabelText('OpenAI API key') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-secret' } });
    const row = input.closest('li');
    if (!row) throw new Error('expected input to be inside a row');
    fireEvent.click(within(row).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByTestId('status-openai').textContent).toBe('Configured'));
    expect(input.value).toBe('');
    expect(invoke).toHaveBeenCalledWith('vault:set', { id: 'openai', value: 'sk-secret' });
  });

  it('deletes a configured credential', async () => {
    stubElectronAPI(['openai']);
    render(<ProviderCredentialsPanel />);

    await waitFor(() => expect(screen.getByTestId('status-openai').textContent).toBe('Configured'));
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButtons[0] as HTMLElement);

    await waitFor(() => expect(screen.getByTestId('status-openai').textContent).toBe('Not configured'));
  });

  it('disables the save button until a value is entered', () => {
    stubElectronAPI();
    render(<ProviderCredentialsPanel />);

    const saveButtons = screen.getAllByRole('button', { name: 'Save' });
    expect((saveButtons[0] as HTMLButtonElement).disabled).toBe(true);
  });
});
