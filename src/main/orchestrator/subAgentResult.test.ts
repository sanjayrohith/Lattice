import { describe, expect, it } from 'vitest';
import type { RunStreamEvent } from '@shared/ipc/events';
import type { ToolCallResult } from '../loop/toolDispatch';
import { accumulateTextDeltas, collectSubAgentResult } from './subAgentResult';

describe('accumulateTextDeltas', () => {
  it('concatenates only text-delta events in order', () => {
    const events: RunStreamEvent[] = [
      { type: 'text-delta', runId: 'r', delta: 'Hello' },
      { type: 'tool-start', runId: 'r', toolCallId: 'tc-1', toolName: 'read_file' },
      { type: 'text-delta', runId: 'r', delta: ', world' },
    ];
    expect(accumulateTextDeltas(events)).toBe('Hello, world');
  });

  it('returns an empty string for no text-delta events', () => {
    expect(accumulateTextDeltas([{ type: 'usage', runId: 'r', promptTokens: 1, completionTokens: 1, totalTokens: 2 }])).toBe('');
  });
});

describe('collectSubAgentResult', () => {
  const textEvents: RunStreamEvent[] = [{ type: 'text-delta', runId: 'r', delta: '  done  ' }];

  it('trims the accumulated output', () => {
    const result = collectSubAgentResult(textEvents, []);
    expect(result.output).toBe('done');
  });

  it('collects paths from successful file-writing tool calls, deduplicated', () => {
    const toolCallResults: ToolCallResult[] = [
      { ok: true, toolCallId: 'tc-1', toolName: 'write_file', output: { path: 'a.txt', bytesWritten: 3 } },
      { ok: true, toolCallId: 'tc-2', toolName: 'edit_file', output: { path: 'a.txt' } },
      { ok: true, toolCallId: 'tc-3', toolName: 'rewrite_file', output: { path: 'b.txt' } },
    ];
    const result = collectSubAgentResult(textEvents, toolCallResults);
    expect(result.filesTouched).toEqual(['a.txt', 'b.txt']);
  });

  it('excludes failed tool calls from filesTouched', () => {
    const toolCallResults: ToolCallResult[] = [
      { ok: false, toolCallId: 'tc-1', toolName: 'write_file', error: { code: 'X', message: 'boom' } },
    ];
    const result = collectSubAgentResult(textEvents, toolCallResults);
    expect(result.filesTouched).toEqual([]);
  });

  it('excludes non-file-writing tool calls', () => {
    const toolCallResults: ToolCallResult[] = [
      { ok: true, toolCallId: 'tc-1', toolName: 'read_file', output: { path: 'a.txt', content: 'x' } },
    ];
    const result = collectSubAgentResult(textEvents, toolCallResults);
    expect(result.filesTouched).toEqual([]);
  });

  it('ignores a successful result whose output has no path field', () => {
    const toolCallResults: ToolCallResult[] = [
      { ok: true, toolCallId: 'tc-1', toolName: 'write_file', output: { bytesWritten: 3 } },
    ];
    const result = collectSubAgentResult(textEvents, toolCallResults);
    expect(result.filesTouched).toEqual([]);
  });
});
