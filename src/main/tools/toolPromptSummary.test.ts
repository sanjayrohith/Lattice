import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { formatToolPromptSummary, formatToolsPromptSummary } from './toolPromptSummary';
import { defineTool } from './types';

const readFileTool = defineTool({
  name: 'read_file',
  description: 'reads a file from the workspace',
  inputSchema: z.object({
    path: z.string().describe('the workspace-relative file path'),
    limit: z.number().int().optional().describe('maximum number of lines to return'),
  }),
  defaultConsent: 'always',
  execute: async () => undefined,
});

describe('formatToolPromptSummary', () => {
  it('includes the tool name and description', () => {
    const summary = formatToolPromptSummary(readFileTool);

    expect(summary).toContain('### read_file');
    expect(summary).toContain('reads a file from the workspace');
  });

  it('propagates each parameter describe() annotation, marking required fields', () => {
    const summary = formatToolPromptSummary(readFileTool);

    expect(summary).toContain('- path (required): the workspace-relative file path');
    expect(summary).toContain('- limit: maximum number of lines to return');
  });

  it('renders a tool with no parameters without a parameter list', () => {
    const tool = defineTool({
      name: 'noop',
      description: 'does nothing',
      inputSchema: z.object({}),
      defaultConsent: 'always',
      execute: async () => undefined,
    });

    const summary = formatToolPromptSummary(tool);
    expect(summary).toBe('### noop\ndoes nothing');
  });

  it('omits the description suffix for a parameter with no describe() annotation', () => {
    const tool = defineTool({
      name: 'echo',
      description: 'echoes input',
      inputSchema: z.object({ text: z.string() }),
      defaultConsent: 'always',
      execute: async () => undefined,
    });

    const summary = formatToolPromptSummary(tool);
    expect(summary.split('\n')).toContain('- text (required)');
  });
});

describe('formatToolsPromptSummary', () => {
  it('joins every tool summary with a blank line between them', () => {
    const other = defineTool({
      name: 'noop',
      description: 'does nothing',
      inputSchema: z.object({}),
      defaultConsent: 'always',
      execute: async () => undefined,
    });

    const summary = formatToolsPromptSummary([readFileTool, other]);
    expect(summary).toBe(`${formatToolPromptSummary(readFileTool)}\n\n${formatToolPromptSummary(other)}`);
  });

  it('returns an empty string for no tools', () => {
    expect(formatToolsPromptSummary([])).toBe('');
  });
});
