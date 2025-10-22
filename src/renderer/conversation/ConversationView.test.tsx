import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ConversationView } from './ConversationView';
import type { ConversationMessage } from './conversationTypes';

afterEach(() => {
  cleanup();
});

describe('ConversationView', () => {
  it('renders a user and an assistant message', () => {
    const messages: ConversationMessage[] = [
      { id: 'm1', role: 'user', text: 'hello' },
      { id: 'm2', role: 'assistant', text: 'hi there' },
    ];

    render(<ConversationView messages={messages} />);

    expect(screen.getByTestId('message-m1').textContent).toContain('hello');
    expect(screen.getByTestId('message-m2').textContent).toContain('hi there');
  });

  it('renders markdown formatting', () => {
    const messages: ConversationMessage[] = [{ id: 'm1', role: 'assistant', text: '**bold text**' }];

    render(<ConversationView messages={messages} />);

    const strong = screen.getByTestId('message-m1').querySelector('strong');
    expect(strong?.textContent).toBe('bold text');
  });

  it('renders a github-flavored markdown table via remark-gfm', () => {
    const messages: ConversationMessage[] = [
      { id: 'm1', role: 'assistant', text: '| a | b |\n| --- | --- |\n| 1 | 2 |' },
    ];

    render(<ConversationView messages={messages} />);

    expect(screen.getByTestId('message-m1').querySelector('table')).toBeTruthy();
  });

  it('renders a fenced code block with syntax highlighting for its language', () => {
    const messages: ConversationMessage[] = [
      { id: 'm1', role: 'assistant', text: '```ts\nconst x = 1;\n```' },
    ];

    render(<ConversationView messages={messages} />);

    const container = screen.getByTestId('message-m1');
    expect(container.textContent).toContain('const');
    expect(container.textContent).toContain('x');
  });

  it('renders inline code without a language as a plain code element', () => {
    const messages: ConversationMessage[] = [{ id: 'm1', role: 'assistant', text: 'use `foo()` here' }];

    render(<ConversationView messages={messages} />);

    const code = screen.getByTestId('message-m1').querySelector('code');
    expect(code?.textContent).toBe('foo()');
  });

  it('marks a streaming message with data-streaming="true"', () => {
    const messages: ConversationMessage[] = [
      { id: 'm1', role: 'assistant', text: 'partial...', streaming: true },
    ];

    render(<ConversationView messages={messages} />);

    expect(screen.getByTestId('message-m1').getAttribute('data-streaming')).toBe('true');
  });

  it('renders an empty list for no messages', () => {
    render(<ConversationView messages={[]} />);
    expect(screen.queryByRole('listitem')).toBeNull();
  });
});
