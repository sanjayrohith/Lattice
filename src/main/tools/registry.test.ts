import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { DuplicateToolError, ToolRegistry } from './registry';
import { defineTool, type AnyTool } from './types';

function makeTool(name: string): AnyTool {
  return defineTool({
    name,
    description: `${name} tool`,
    inputSchema: z.object({}),
    defaultConsent: 'always',
    execute: async () => undefined,
  });
}

describe('ToolRegistry', () => {
  it('registers and looks up a tool by name', () => {
    const registry = new ToolRegistry();
    const tool = makeTool('read_file');

    registry.register(tool);

    expect(registry.get('read_file')).toBe(tool);
  });

  it('returns undefined for an unregistered name', () => {
    const registry = new ToolRegistry();
    expect(registry.get('missing')).toBeUndefined();
  });

  it('throws DuplicateToolError on a duplicate registration', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('read_file'));

    expect(() => registry.register(makeTool('read_file'))).toThrow(DuplicateToolError);
  });

  it('lists every registered tool in registration order', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('a'));
    registry.register(makeTool('b'));
    registry.register(makeTool('c'));

    expect(registry.list().map((t) => t.name)).toEqual(['a', 'b', 'c']);
  });

  it('lists every tool for an agent with no allowlist', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('a'));
    registry.register(makeTool('b'));

    expect(registry.listForAgent().map((t) => t.name)).toEqual(['a', 'b']);
  });

  it('filters to only allowlisted tools for an agent', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('a'));
    registry.register(makeTool('b'));
    registry.register(makeTool('c'));

    expect(registry.listForAgent(['b', 'c']).map((t) => t.name)).toEqual(['b', 'c']);
  });

  it('ignores allowlist entries that name no registered tool', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('a'));

    expect(registry.listForAgent(['a', 'does-not-exist']).map((t) => t.name)).toEqual(['a']);
  });

  it('returns an empty list for an empty allowlist', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('a'));

    expect(registry.listForAgent([])).toEqual([]);
  });
});
