import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

afterEach(() => {
  cleanup();
});

function Bomb({ shouldThrow }: { shouldThrow: boolean }): React.JSX.Element {
  if (shouldThrow) {
    throw new Error('kaboom');
  }
  return <div>fine</div>;
}

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('fine')).toBeTruthy();
  });

  it('renders a recoverable crash panel when a descendant throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('kaboom')).toBeTruthy();

    vi.restoreAllMocks();
  });

  it('resets and re-renders children after clicking the recover button', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    let shouldThrow = true;
    function Toggle(): React.JSX.Element {
      return <Bomb shouldThrow={shouldThrow} />;
    }

    const { rerender } = render(
      <ErrorBoundary>
        <Toggle />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeTruthy();

    shouldThrow = false;
    fireEvent.click(screen.getByText('Try to recover'));
    rerender(
      <ErrorBoundary>
        <Toggle />
      </ErrorBoundary>,
    );

    expect(screen.getByText('fine')).toBeTruthy();

    vi.restoreAllMocks();
  });
});
