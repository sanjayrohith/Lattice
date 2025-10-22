import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ToolCallPreviewCard, ToolCallPreviewList } from './ToolCallPreview';
import type { ToolCallPreviewState } from './toolCallPreviewTypes';

afterEach(() => {
  cleanup();
});

describe('ToolCallPreviewCard', () => {
  it('renders the tool name and status', () => {
    const preview: ToolCallPreviewState = {
      toolCallId: 'c1',
      toolName: 'write_file',
      partialArgs: { path: 'a.txt', content: 'hi' },
      status: 'pending',
    };

    render(<ToolCallPreviewCard preview={preview} />);

    const card = screen.getByTestId('tool-call-c1');
    expect(card.textContent).toContain('write_file');
    expect(card.textContent).toContain('pending');
  });

  it('renders a command-line preview for run_command', () => {
    const preview: ToolCallPreviewState = {
      toolCallId: 'c1',
      toolName: 'run_command',
      partialArgs: { command: 'npm', args: ['test'] },
      status: 'pending',
    };

    render(<ToolCallPreviewCard preview={preview} />);
    expect(screen.getByTestId('tool-call-c1').textContent).toContain('$ npm test');
  });

  it('renders a path and content preview for write_file', () => {
    const preview: ToolCallPreviewState = {
      toolCallId: 'c1',
      toolName: 'write_file',
      partialArgs: { path: 'src/a.ts', content: 'const x = 1;' },
      status: 'pending',
    };

    render(<ToolCallPreviewCard preview={preview} />);
    const card = screen.getByTestId('tool-call-c1');
    expect(card.textContent).toContain('src/a.ts');
    expect(card.textContent).toContain('const x = 1;');
  });

  it('renders a diff-style preview for edit_file', () => {
    const preview: ToolCallPreviewState = {
      toolCallId: 'c1',
      toolName: 'edit_file',
      partialArgs: { path: 'a.ts', search: 'old', replace: 'new' },
      status: 'pending',
    };

    render(<ToolCallPreviewCard preview={preview} />);
    const card = screen.getByTestId('tool-call-c1');
    expect(card.textContent).toContain('- old');
    expect(card.textContent).toContain('+ new');
  });

  it('renders a placeholder while args are not yet parseable', () => {
    const preview: ToolCallPreviewState = {
      toolCallId: 'c1',
      toolName: 'write_file',
      partialArgs: undefined,
      status: 'pending',
    };

    render(<ToolCallPreviewCard preview={preview} />);
    expect(screen.getByTestId('tool-call-c1').textContent).toContain('…');
  });

  it('renders a generic JSON dump for an unrecognized tool', () => {
    const preview: ToolCallPreviewState = {
      toolCallId: 'c1',
      toolName: 'search_memory',
      partialArgs: { query: 'foo' },
      status: 'pending',
    };

    render(<ToolCallPreviewCard preview={preview} />);
    expect(screen.getByTestId('tool-call-c1').textContent).toContain('"query"');
  });

  it('applies a status-specific class for succeeded and failed', () => {
    const succeeded: ToolCallPreviewState = {
      toolCallId: 'c1',
      toolName: 'read_file',
      partialArgs: {},
      status: 'succeeded',
    };
    const { container } = render(<ToolCallPreviewCard preview={succeeded} />);
    expect(container.querySelector('.tool-call-preview--succeeded')).toBeTruthy();
  });
});

describe('ToolCallPreviewList', () => {
  it('renders nothing for an empty list', () => {
    const { container } = render(<ToolCallPreviewList previews={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one card per preview, in order', () => {
    const previews: ToolCallPreviewState[] = [
      { toolCallId: 'c1', toolName: 'a', partialArgs: {}, status: 'pending' },
      { toolCallId: 'c2', toolName: 'b', partialArgs: {}, status: 'pending' },
    ];

    render(<ToolCallPreviewList previews={previews} />);

    expect(screen.getByTestId('tool-call-c1')).toBeTruthy();
    expect(screen.getByTestId('tool-call-c2')).toBeTruthy();
  });
});
