import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { dispatchToolCall, dispatchToolCalls } from './toolDispatch';
import { ToolRegistry } from '../tools/registry';
import { defineTool } from '../tools/types';

const context = { workspaceRoot: '/tmp/workspace' };

function makeRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(
    defineTool({
      name: 'echo',
      description: 'echoes text back',
      inputSchema: z.object({ text: z.string() }),
      defaultConsent: 'always',
      execute: async (input) => ({ text: input.text }),
    }),
  );
  registry.register(
    defineTool({
      name: 'boom',
      description: 'always throws',
      inputSchema: z.object({}),
      defaultConsent: 'always',
      execute: async () => {
        const error = new Error('kaboom') as Error & { code?: string };
        error.code = 'CUSTOM_FAILURE';
        throw error;
      },
    }),
  );
  return registry;
}

describe('dispatchToolCall', () => {
  it('executes a known tool with valid arguments and returns its output', async () => {
    const result = await dispatchToolCall(
      { toolCallId: 'c1', toolName: 'echo', input: { text: 'hi' } },
      makeRegistry(),
      context,
    );

    expect(result).toEqual({ ok: true, toolCallId: 'c1', toolName: 'echo', output: { text: 'hi' } });
  });

  it('reports UNKNOWN_TOOL for a name absent from the registry', async () => {
    const result = await dispatchToolCall(
      { toolCallId: 'c1', toolName: 'does_not_exist', input: {} },
      makeRegistry(),
      context,
    );

    expect(result).toEqual({
      ok: false,
      toolCallId: 'c1',
      toolName: 'does_not_exist',
      error: { code: 'UNKNOWN_TOOL', message: expect.stringContaining('does_not_exist') },
    });
  });

  it('reports INVALID_TOOL_ARGUMENTS without ever calling execute', async () => {
    const result = await dispatchToolCall(
      { toolCallId: 'c1', toolName: 'echo', input: { text: 42 } },
      makeRegistry(),
      context,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_TOOL_ARGUMENTS');
    }
  });

  it('carries a thrown error object code through the failure result', async () => {
    const result = await dispatchToolCall(
      { toolCallId: 'c1', toolName: 'boom', input: {} },
      makeRegistry(),
      context,
    );

    expect(result).toEqual({
      ok: false,
      toolCallId: 'c1',
      toolName: 'boom',
      error: { code: 'CUSTOM_FAILURE', message: 'kaboom' },
    });
  });

  it('defaults to TOOL_EXECUTION_ERROR when a thrown error carries no code', async () => {
    const registry = new ToolRegistry();
    registry.register(
      defineTool({
        name: 'plain_throw',
        description: 'throws a plain error',
        inputSchema: z.object({}),
        defaultConsent: 'always',
        execute: async () => {
          throw new Error('plain failure');
        },
      }),
    );

    const result = await dispatchToolCall(
      { toolCallId: 'c1', toolName: 'plain_throw', input: {} },
      registry,
      context,
    );

    expect(result).toEqual({
      ok: false,
      toolCallId: 'c1',
      toolName: 'plain_throw',
      error: { code: 'TOOL_EXECUTION_ERROR', message: 'plain failure' },
    });
  });
});

describe('dispatchToolCalls', () => {
  it('executes every call sequentially, in order', async () => {
    const order: string[] = [];
    const registry = new ToolRegistry();
    registry.register(
      defineTool({
        name: 'record',
        description: 'records call order with an artificial delay',
        inputSchema: z.object({ id: z.string() }),
        defaultConsent: 'always',
        execute: async (input) => {
          await new Promise((resolve) => setTimeout(resolve, input.id === 'first' ? 20 : 0));
          order.push(input.id);
          return input.id;
        },
      }),
    );

    const results = await dispatchToolCalls(
      [
        { toolCallId: 'c1', toolName: 'record', input: { id: 'first' } },
        { toolCallId: 'c2', toolName: 'record', input: { id: 'second' } },
      ],
      registry,
      context,
    );

    expect(order).toEqual(['first', 'second']);
    expect(results.map((r) => r.toolCallId)).toEqual(['c1', 'c2']);
  });

  it('continues dispatching later calls after an earlier one fails', async () => {
    const results = await dispatchToolCalls(
      [
        { toolCallId: 'c1', toolName: 'boom', input: {} },
        { toolCallId: 'c2', toolName: 'echo', input: { text: 'still runs' } },
      ],
      makeRegistry(),
      context,
    );

    expect(results[0]?.ok).toBe(false);
    expect(results[1]).toEqual({
      ok: true,
      toolCallId: 'c2',
      toolName: 'echo',
      output: { text: 'still runs' },
    });
  });

  it('returns an empty array for no calls', async () => {
    expect(await dispatchToolCalls([], makeRegistry(), context)).toEqual([]);
  });
});
