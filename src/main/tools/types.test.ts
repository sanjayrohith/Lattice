import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { defineTool, type Tool } from './types';

describe('defineTool', () => {
  it('preserves the tool shape and infers input/output types from the schema and execute', async () => {
    const echoTool = defineTool({
      name: 'echo',
      description: 'echoes the input text back',
      inputSchema: z.object({ text: z.string() }),
      defaultConsent: 'always',
      execute: async (input) => ({ text: input.text }),
    });

    expect(echoTool.name).toBe('echo');
    expect(echoTool.defaultConsent).toBe('always');

    const parsed = echoTool.inputSchema.parse({ text: 'hello' });
    const result = await echoTool.execute(parsed, { workspaceRoot: '/tmp' });
    expect(result).toEqual({ text: 'hello' });
  });

  it('rejects input that fails schema validation', () => {
    const tool: Tool<{ text: string }> = defineTool({
      name: 'echo',
      description: 'echoes the input text back',
      inputSchema: z.object({ text: z.string() }),
      defaultConsent: 'always',
      execute: async (input) => input,
    });

    expect(() => tool.inputSchema.parse({ text: 42 })).toThrow();
  });

  it('supports every consent policy value', () => {
    for (const defaultConsent of ['always', 'ask', 'never'] as const) {
      const tool = defineTool({
        name: `tool-${defaultConsent}`,
        description: 'test tool',
        inputSchema: z.object({}),
        defaultConsent,
        execute: async () => undefined,
      });
      expect(tool.defaultConsent).toBe(defaultConsent);
    }
  });
});
