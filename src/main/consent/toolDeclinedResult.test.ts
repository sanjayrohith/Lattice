import { describe, expect, it } from 'vitest';
import { TOOL_DECLINED_CODE, toolDeclinedResult } from './toolDeclinedResult';

describe('toolDeclinedResult', () => {
  it('builds a failure result carrying the TOOL_DECLINED code', () => {
    const result = toolDeclinedResult('c1', 'write_file');

    expect(result.ok).toBe(false);
    expect(result.toolCallId).toBe('c1');
    expect(result.toolName).toBe('write_file');
    expect(result.error.code).toBe(TOOL_DECLINED_CODE);
  });

  it('names the tool in the message so the model can reason about the refusal', () => {
    const result = toolDeclinedResult('c1', 'run_command');
    expect(result.error.message).toContain('run_command');
    expect(result.error.message).toContain('declined');
  });
});
