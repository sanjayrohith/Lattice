import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { defineTool } from '../tools/types';
import {
  DELEGATE_TO_AGENT_TOOL_NAME,
  buildToolsetWithDelegation,
  createDelegateToAgentTool,
} from './delegationTool';

const readFileLikeTool = defineTool({
  name: 'read_file',
  description: 'reads a file',
  inputSchema: z.object({ path: z.string() }),
  defaultConsent: 'always',
  execute: async () => 'unused',
});

describe('createDelegateToAgentTool', () => {
  it('calls onDelegate with the validated input when executed', async () => {
    const onDelegate = vi.fn().mockResolvedValue({ summary: 'done' });
    const tool = createDelegateToAgentTool(['coder'], onDelegate);

    const parsed = tool.inputSchema.parse({ target_agent: 'coder', task_description: 'fix it' });
    const result = await tool.execute(parsed, { workspaceRoot: '/ws' });

    expect(onDelegate).toHaveBeenCalledWith({ target_agent: 'coder', task_description: 'fix it' });
    expect(result).toEqual({ summary: 'done' });
  });

  it('requires consent by default', () => {
    const tool = createDelegateToAgentTool(['coder'], vi.fn());
    expect(tool.defaultConsent).toBe('ask');
  });
});

describe('buildToolsetWithDelegation', () => {
  it('appends the delegation tool alongside existing tools when agents are available', () => {
    const toolset = buildToolsetWithDelegation([readFileLikeTool], ['coder'], vi.fn());
    expect(toolset.map((t) => t.name)).toEqual(['read_file', DELEGATE_TO_AGENT_TOOL_NAME]);
  });

  it('omits the delegation tool entirely when no agents are available', () => {
    const toolset = buildToolsetWithDelegation([readFileLikeTool], [], vi.fn());
    expect(toolset.map((t) => t.name)).toEqual(['read_file']);
  });

  it('rebuilds the toolset independently for a changed roster between turns', () => {
    const turnOne = buildToolsetWithDelegation([readFileLikeTool], ['coder'], vi.fn());
    const turnTwo = buildToolsetWithDelegation([readFileLikeTool], ['coder', 'reviewer'], vi.fn());

    const schemaOne = turnOne[1]?.inputSchema as z.ZodTypeAny;
    const schemaTwo = turnTwo[1]?.inputSchema as z.ZodTypeAny;

    expect(schemaOne.safeParse({ target_agent: 'reviewer', task_description: 'x' }).success).toBe(false);
    expect(schemaTwo.safeParse({ target_agent: 'reviewer', task_description: 'x' }).success).toBe(true);
  });
});
