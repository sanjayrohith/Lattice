import { describe, expect, it } from 'vitest';
import { appendToolResults, toolResultsToMessage } from './reinjectToolResults';
import type { InternalMessage } from '../ai/messages';
import type { ToolCallResult } from './toolDispatch';

describe('toolResultsToMessage', () => {
  it('converts a successful result into a non-error tool-result part', () => {
    const results: ToolCallResult[] = [
      { ok: true, toolCallId: 'c1', toolName: 'read_file', output: { content: 'hi' } },
    ];

    expect(toolResultsToMessage(results)).toEqual({
      role: 'tool',
      parts: [
        {
          type: 'tool-result',
          toolCallId: 'c1',
          toolName: 'read_file',
          output: { content: 'hi' },
          isError: false,
        },
      ],
    });
  });

  it('folds a failure error into output with isError: true', () => {
    const results: ToolCallResult[] = [
      {
        ok: false,
        toolCallId: 'c1',
        toolName: 'read_file',
        error: { code: 'UNKNOWN_TOOL', message: 'no such tool' },
      },
    ];

    expect(toolResultsToMessage(results)).toEqual({
      role: 'tool',
      parts: [
        {
          type: 'tool-result',
          toolCallId: 'c1',
          toolName: 'read_file',
          output: { error: { code: 'UNKNOWN_TOOL', message: 'no such tool' } },
          isError: true,
        },
      ],
    });
  });

  it('converts a mixed batch preserving each result independently', () => {
    const results: ToolCallResult[] = [
      { ok: true, toolCallId: 'c1', toolName: 'a', output: 1 },
      { ok: false, toolCallId: 'c2', toolName: 'b', error: { code: 'X', message: 'bad' } },
    ];

    const message = toolResultsToMessage(results);
    expect(message.parts).toHaveLength(2);
    expect(message.parts[0]).toMatchObject({ toolCallId: 'c1', isError: false });
    expect(message.parts[1]).toMatchObject({ toolCallId: 'c2', isError: true });
  });
});

describe('appendToolResults', () => {
  it('appends a tool message to the history', () => {
    const history: InternalMessage[] = [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }];
    const results: ToolCallResult[] = [
      { ok: true, toolCallId: 'c1', toolName: 'echo', output: 'hi' },
    ];

    const updated = appendToolResults(history, results);

    expect(updated).toHaveLength(2);
    expect(updated[1]?.role).toBe('tool');
  });

  it('does not mutate the original history array', () => {
    const history: InternalMessage[] = [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }];
    const results: ToolCallResult[] = [
      { ok: true, toolCallId: 'c1', toolName: 'echo', output: 'hi' },
    ];

    appendToolResults(history, results);

    expect(history).toHaveLength(1);
  });

  it('leaves the history unchanged when there are no results', () => {
    const history: InternalMessage[] = [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }];

    const updated = appendToolResults(history, []);

    expect(updated).toEqual(history);
    expect(updated).not.toBe(history);
  });
});
