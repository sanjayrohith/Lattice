import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TitleBar } from './TitleBar';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function stubElectronAPI(): ReturnType<typeof vi.fn> {
  const invoke = vi.fn().mockResolvedValue({ ok: true, data: undefined });
  (window as unknown as { electronAPI: { invoke: typeof invoke } }).electronAPI = { invoke };
  return invoke;
}

describe('TitleBar', () => {
  it('invokes the minimize channel when the minimize button is clicked', () => {
    const invoke = stubElectronAPI();
    render(<TitleBar />);

    fireEvent.click(screen.getByLabelText('Minimize window'));
    expect(invoke).toHaveBeenCalledWith('window:minimize', undefined);
  });

  it('invokes the maximize-toggle channel when the maximize button is clicked', () => {
    const invoke = stubElectronAPI();
    render(<TitleBar />);

    fireEvent.click(screen.getByLabelText('Maximize or restore window'));
    expect(invoke).toHaveBeenCalledWith('window:maximize-toggle', undefined);
  });

  it('invokes the close channel when the close button is clicked', () => {
    const invoke = stubElectronAPI();
    render(<TitleBar />);

    fireEvent.click(screen.getByLabelText('Close window'));
    expect(invoke).toHaveBeenCalledWith('window:close', undefined);
  });
});
