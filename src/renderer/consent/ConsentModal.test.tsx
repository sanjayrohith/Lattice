import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { ConsentModal } from './ConsentModal';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function stubElectronAPI() {
  let listener: ((event: unknown) => void) | undefined;
  const invoke = vi.fn().mockResolvedValue({ ok: true, data: { resolved: true } });
  const subscribe = vi.fn((_channel: string, cb: (event: unknown) => void) => {
    listener = cb;
    return () => {
      listener = undefined;
    };
  });

  (window as unknown as { electronAPI: { invoke: typeof invoke; subscribe: typeof subscribe } }).electronAPI =
    { invoke, subscribe };

  return {
    invoke,
    subscribe,
    emit: (event: unknown) => act(() => listener?.(event)),
  };
}

const sampleRequest = {
  runId: 'r1',
  toolCallId: 'c1',
  toolName: 'write_file',
  input: { path: 'a.txt', content: 'hello' },
};

describe('ConsentModal', () => {
  it('renders nothing when there is no pending request', () => {
    stubElectronAPI();
    render(<ConsentModal />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the tool name and an argument preview once a request arrives', () => {
    const api = stubElectronAPI();
    render(<ConsentModal />);

    api.emit(sampleRequest);

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getAllByText('write_file').length).toBeGreaterThan(0);
    expect(screen.getByText(/"path": "a.txt"/)).toBeTruthy();
  });

  it('renders all three consent actions', () => {
    const api = stubElectronAPI();
    render(<ConsentModal />);
    api.emit(sampleRequest);

    expect(screen.getByRole('button', { name: 'Accept once' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Accept always' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeTruthy();
  });

  it('sends accept-once and clears the modal', async () => {
    const api = stubElectronAPI();
    render(<ConsentModal />);
    api.emit(sampleRequest);

    screen.getByRole('button', { name: 'Accept once' }).click();

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.invoke).toHaveBeenCalledWith('consent:respond', {
      runId: 'r1',
      toolCallId: 'c1',
      toolName: 'write_file',
      decision: 'accept-once',
    });
  });

  it('sends accept-always', async () => {
    const api = stubElectronAPI();
    render(<ConsentModal />);
    api.emit(sampleRequest);

    screen.getByRole('button', { name: 'Accept always' }).click();

    await waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith('consent:respond', expect.objectContaining({
        decision: 'accept-always',
      })),
    );
  });

  it('sends decline', async () => {
    const api = stubElectronAPI();
    render(<ConsentModal />);
    api.emit(sampleRequest);

    screen.getByRole('button', { name: 'Decline' }).click();

    await waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith(
        'consent:respond',
        expect.objectContaining({ decision: 'decline' }),
      ),
    );
  });

  it('unsubscribes on unmount', () => {
    const api = stubElectronAPI();
    const { unmount } = render(<ConsentModal />);
    unmount();

    expect(api.subscribe).toHaveBeenCalled();
  });
});
