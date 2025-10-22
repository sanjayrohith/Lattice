import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RunControls } from './RunControls';

afterEach(() => {
  cleanup();
});

const baseUsage = { promptTokens: 100, completionTokens: 40, totalTokens: 140 };

describe('RunControls', () => {
  it('renders the step, elapsed time, and usage readout', () => {
    render(
      <RunControls
        onSend={vi.fn()}
        onStop={vi.fn()}
        running={false}
        currentStep={3}
        stepCap={25}
        elapsedSeconds={65}
        usage={baseUsage}
      />,
    );

    expect(screen.getByTestId('run-controls-step').textContent).toBe('Step 3 / 25');
    expect(screen.getByTestId('run-controls-elapsed').textContent).toBe('1:05');
    expect(screen.getByTestId('run-controls-usage').textContent).toBe(
      '140 tokens (100 prompt / 40 completion)',
    );
  });

  it('formats elapsed seconds under a minute with a leading zero', () => {
    render(
      <RunControls
        onSend={vi.fn()}
        onStop={vi.fn()}
        running={false}
        currentStep={0}
        stepCap={25}
        elapsedSeconds={7}
        usage={baseUsage}
      />,
    );

    expect(screen.getByTestId('run-controls-elapsed').textContent).toBe('0:07');
  });

  it('calls onSend with the trimmed message and clears the input', () => {
    const onSend = vi.fn();
    render(
      <RunControls
        onSend={onSend}
        onStop={vi.fn()}
        running={false}
        currentStep={0}
        stepCap={25}
        elapsedSeconds={0}
        usage={baseUsage}
      />,
    );

    const input = screen.getByLabelText('Message') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: '  hello there  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSend).toHaveBeenCalledWith('hello there');
    expect(input.value).toBe('');
  });

  it('sends on Enter without Shift', () => {
    const onSend = vi.fn();
    render(
      <RunControls
        onSend={onSend}
        onStop={vi.fn()}
        running={false}
        currentStep={0}
        stepCap={25}
        elapsedSeconds={0}
        usage={baseUsage}
      />,
    );

    const input = screen.getByLabelText('Message');
    fireEvent.change(input, { target: { value: 'hi' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    expect(onSend).toHaveBeenCalledWith('hi');
  });

  it('does not send on Shift+Enter', () => {
    const onSend = vi.fn();
    render(
      <RunControls
        onSend={onSend}
        onStop={vi.fn()}
        running={false}
        currentStep={0}
        stepCap={25}
        elapsedSeconds={0}
        usage={baseUsage}
      />,
    );

    const input = screen.getByLabelText('Message');
    fireEvent.change(input, { target: { value: 'hi' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('disables Send for an empty or whitespace-only message', () => {
    render(
      <RunControls
        onSend={vi.fn()}
        onStop={vi.fn()}
        running={false}
        currentStep={0}
        stepCap={25}
        elapsedSeconds={0}
        usage={baseUsage}
      />,
    );

    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables the input and Send while running, and enables Stop', () => {
    render(
      <RunControls
        onSend={vi.fn()}
        onStop={vi.fn()}
        running={true}
        currentStep={2}
        stepCap={25}
        elapsedSeconds={10}
        usage={baseUsage}
      />,
    );

    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Stop' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables Stop while not running', () => {
    render(
      <RunControls
        onSend={vi.fn()}
        onStop={vi.fn()}
        running={false}
        currentStep={0}
        stepCap={25}
        elapsedSeconds={0}
        usage={baseUsage}
      />,
    );

    expect((screen.getByRole('button', { name: 'Stop' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('calls onStop when Stop is clicked', () => {
    const onStop = vi.fn();
    render(
      <RunControls
        onSend={vi.fn()}
        onStop={onStop}
        running={true}
        currentStep={0}
        stepCap={25}
        elapsedSeconds={0}
        usage={baseUsage}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
