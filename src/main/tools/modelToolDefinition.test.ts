import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { toModelToolDefinition, toModelToolDefinitions } from './modelToolDefinition';
import { defineTool } from './types';

describe('toModelToolDefinition', () => {
  it('carries the tool name and description through unchanged', () => {
    const tool = defineTool({
      name: 'read_file',
      description: 'reads a file from the workspace',
      inputSchema: z.object({ path: z.string() }),
      defaultConsent: 'always',
      execute: async () => undefined,
    });

    const definition = toModelToolDefinition(tool);

    expect(definition.name).toBe('read_file');
    expect(definition.description).toBe('reads a file from the workspace');
  });

  it('marks non-optional fields as required in the JSON schema', () => {
    const tool = defineTool({
      name: 'read_file',
      description: 'reads a file',
      inputSchema: z.object({
        path: z.string(),
        limit: z.number().int().optional(),
      }),
      defaultConsent: 'always',
      execute: async () => undefined,
    });

    const definition = toModelToolDefinition(tool);

    expect(definition.parameters['required']).toEqual(['path']);
    expect(Object.keys(definition.parameters['properties'] as object)).toEqual(['path', 'limit']);
  });

  it('renders an enum field as a JSON schema enum', () => {
    const tool = defineTool({
      name: 'set_mode',
      description: 'sets the run mode',
      inputSchema: z.object({ mode: z.enum(['fast', 'thorough']) }),
      defaultConsent: 'always',
      execute: async () => undefined,
    });

    const definition = toModelToolDefinition(tool);
    const properties = definition.parameters['properties'] as Record<string, { enum?: string[] }>;

    expect(properties['mode']?.enum).toEqual(['fast', 'thorough']);
  });

  it('preserves a describe() annotation on a field as its description', () => {
    const tool = defineTool({
      name: 'read_file',
      description: 'reads a file',
      inputSchema: z.object({ path: z.string().describe('the workspace-relative file path') }),
      defaultConsent: 'always',
      execute: async () => undefined,
    });

    const definition = toModelToolDefinition(tool);
    const properties = definition.parameters['properties'] as Record<string, { description?: string }>;

    expect(properties['path']?.description).toBe('the workspace-relative file path');
  });
});

describe('toModelToolDefinitions', () => {
  it('converts every tool in order', () => {
    const tools = [
      defineTool({
        name: 'a',
        description: 'tool a',
        inputSchema: z.object({}),
        defaultConsent: 'always',
        execute: async () => undefined,
      }),
      defineTool({
        name: 'b',
        description: 'tool b',
        inputSchema: z.object({}),
        defaultConsent: 'always',
        execute: async () => undefined,
      }),
    ];

    expect(toModelToolDefinitions(tools).map((d) => d.name)).toEqual(['a', 'b']);
  });
});
