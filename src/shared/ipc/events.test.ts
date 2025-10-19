import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from './channels';
import { ipcEventContracts, runStreamEventSchema } from './events';

describe('runStreamEventSchema', () => {
  it('accepts every declared event variant', () => {
    const samples = [
      { type: 'text-delta', runId: 'r1', delta: 'hi' },
      { type: 'partial-tool-args', runId: 'r1', toolCallId: 'c1', toolName: 'read_file', partialArgs: { path: 'a' } },
      { type: 'tool-start', runId: 'r1', toolCallId: 'c1', toolName: 'read_file' },
      { type: 'tool-result', runId: 'r1', toolCallId: 'c1', result: { content: 'hi' } },
      { type: 'state-change', runId: 'r1', state: 'streaming' },
    ];

    for (const sample of samples) {
      expect(runStreamEventSchema.safeParse(sample).success).toBe(true);
    }
  });

  it('rejects an event with an unknown type', () => {
    expect(runStreamEventSchema.safeParse({ type: 'unknown', runId: 'r1' }).success).toBe(false);
  });

  it('rejects a text-delta event missing its delta field', () => {
    expect(runStreamEventSchema.safeParse({ type: 'text-delta', runId: 'r1' }).success).toBe(false);
  });
});

describe('ipcEventContracts run:stream', () => {
  it('validates a batch of run stream events', () => {
    const schema = ipcEventContracts[IPC_CHANNELS.RUN_STREAM];
    const result = schema.safeParse([
      { type: 'text-delta', runId: 'r1', delta: 'hi' },
      { type: 'state-change', runId: 'r1', state: 'completed' },
    ]);

    expect(result.success).toBe(true);
  });

  it('accepts an empty batch', () => {
    const schema = ipcEventContracts[IPC_CHANNELS.RUN_STREAM];
    expect(schema.safeParse([]).success).toBe(true);
  });
});
