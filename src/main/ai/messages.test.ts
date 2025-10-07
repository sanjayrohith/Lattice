import { describe, expect, it } from 'vitest';
import { toModelMessage, toModelMessages, type InternalMessage } from './messages';

describe('toModelMessage', () => {
  it('converts a system message to a plain string content', () => {
    const message: InternalMessage = { role: 'system', parts: [{ type: 'text', text: 'be helpful' }] };
    expect(toModelMessage(message)).toEqual({ role: 'system', content: 'be helpful' });
  });

  it('converts a plain-text user message to a string content', () => {
    const message: InternalMessage = { role: 'user', parts: [{ type: 'text', text: 'hello' }] };
    expect(toModelMessage(message)).toEqual({ role: 'user', content: 'hello' });
  });

  it('converts a user message with an image attachment into a content array', () => {
    const message: InternalMessage = {
      role: 'user',
      parts: [
        { type: 'text', text: 'what is this?' },
        { type: 'image', dataUrl: 'data:image/png;base64,AAAA', mediaType: 'image/png' },
      ],
    };

    expect(toModelMessage(message)).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'what is this?' },
        { type: 'file', data: 'data:image/png;base64,AAAA', mediaType: 'image/png' },
      ],
    });
  });

  it('defaults an image mediaType to image/png when absent', () => {
    const message: InternalMessage = {
      role: 'user',
      parts: [{ type: 'image', dataUrl: 'data:image/jpeg;base64,BBBB' }],
    };

    const result = toModelMessage(message);
    expect(result).toEqual({
      role: 'user',
      content: [{ type: 'file', data: 'data:image/jpeg;base64,BBBB', mediaType: 'image/png' }],
    });
  });

  it('converts a plain-text assistant message to a string content', () => {
    const message: InternalMessage = { role: 'assistant', parts: [{ type: 'text', text: 'sure' }] };
    expect(toModelMessage(message)).toEqual({ role: 'assistant', content: 'sure' });
  });

  it('converts an assistant message with a tool call into a content array', () => {
    const message: InternalMessage = {
      role: 'assistant',
      parts: [
        { type: 'text', text: 'let me check' },
        { type: 'tool-call', toolCallId: 'call-1', toolName: 'read_file', input: { path: 'a.txt' } },
      ],
    };

    expect(toModelMessage(message)).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'let me check' },
        { type: 'tool-call', toolCallId: 'call-1', toolName: 'read_file', input: { path: 'a.txt' } },
      ],
    });
  });

  it('converts a tool message with a json result', () => {
    const message: InternalMessage = {
      role: 'tool',
      parts: [
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'read_file',
          output: { content: 'file contents' },
        },
      ],
    };

    expect(toModelMessage(message)).toEqual({
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'read_file',
          output: { type: 'json', value: { content: 'file contents' } },
        },
      ],
    });
  });

  it('converts a tool message with a plain string result to a text output', () => {
    const message: InternalMessage = {
      role: 'tool',
      parts: [{ type: 'tool-result', toolCallId: 'call-1', toolName: 'read_file', output: 'raw text' }],
    };

    expect(toModelMessage(message)).toEqual({
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'read_file',
          output: { type: 'text', value: 'raw text' },
        },
      ],
    });
  });

  it('throws when a user message contains a part it cannot represent', () => {
    const message = {
      role: 'user',
      parts: [{ type: 'tool-call', toolCallId: 'x', toolName: 'y', input: {} }],
    } as unknown as InternalMessage;

    expect(() => toModelMessage(message)).toThrow('unsupported user message part');
  });
});

describe('toModelMessages', () => {
  it('converts a full history in order', () => {
    const history: InternalMessage[] = [
      { role: 'system', parts: [{ type: 'text', text: 'sys' }] },
      { role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      { role: 'assistant', parts: [{ type: 'text', text: 'hello' }] },
    ];

    const result = toModelMessages(history);
    expect(result.map((m) => m.role)).toEqual(['system', 'user', 'assistant']);
  });
});
