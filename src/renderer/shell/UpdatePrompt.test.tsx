import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UpdatePrompt } from './UpdatePrompt';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function stubElectronAPI() {
  let listener: ((event: unknown) => void) | undefined;
  const invoke = vi.fn().mockResolvedValue({ ok: true, data: { installing: true } });
  const subscribe = vi.fn((_channel: string, cb: (event: unknown) => void) => {
    listener = cb;
    return () => {
      listener = undefined;
    };
  });

  (window as unknown as { electronAPI: { invoke: typeof invoke; subscribe: typeof subscribe } }).electronAPI = {
    invoke,
    subscribe,
  };

  return { invoke, emit: (event: unknown) => act(() => listener?.(event)) };
}

describe('UpdatePrompt', () => {
  it('renders nothing before an update is available', () => {
    stubElectronAPI();
    const { container } = render(<UpdatePrompt />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the prompt once an update:available event arrives', async () => {
    const { emit } = stubElectronAPI();
    render(<UpdatePrompt />);

    emit({ version: '2.0.0' });

    await waitFor(() => expect(screen.getByText(/Version 2.0.0 is ready/)).toBeTruthy());
  });

  it('invokes update:install when Restart now is clicked', async () => {
    const { emit, invoke } = stubElectronAPI();
    render(<UpdatePrompt />);
    emit({ version: '2.0.0' });
    await waitFor(() => expect(screen.getByText(/Version 2.0.0 is ready/)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Restart now' }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('update:install', undefined));
  });

  it('dismisses the prompt when Later is clicked', async () => {
    const { emit } = stubElectronAPI();
    render(<UpdatePrompt />);
    emit({ version: '2.0.0' });
    await waitFor(() => expect(screen.getByText(/Version 2.0.0 is ready/)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Later' }));

    expect(screen.queryByText(/Version 2.0.0 is ready/)).toBeNull();
  });
});
