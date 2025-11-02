import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { defineTool } from '../tools/types';
import { ToolRegistry } from '../tools/registry';
import type { AgentProfile } from '../agents/agentProfile';
import { createSubAgentRunContext } from './subAgentRunContext';

const readFileTool = defineTool({
  name: 'read_file',
  description: 'reads',
  inputSchema: z.object({ path: z.string() }),
  defaultConsent: 'always',
  execute: async () => 'unused',
});

const writeFileTool = defineTool({
  name: 'write_file',
  description: 'writes',
  inputSchema: z.object({ path: z.string(), content: z.string() }),
  defaultConsent: 'ask',
  execute: async () => 'unused',
});

function registryWithBothTools(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(readFileTool);
  registry.register(writeFileTool);
  return registry;
}

const baseProfile: AgentProfile = {
  id: 'coder',
  displayName: 'Coder',
  backend: { kind: 'acp', connectorId: 'codex-cli' },
  systemPrompt: '',
  toolAllowlist: ['read_file'],
  stepBudget: 5,
  role: 'worker',
};

describe('createSubAgentRunContext', () => {
  it('seeds history from the task description alone when there is no context', () => {
    const context = createSubAgentRunContext({
      agentProfile: baseProfile,
      delegation: { target_agent: 'coder', task_description: 'fix the bug' },
      toolRegistry: registryWithBothTools(),
      runIdFactory: () => 'sub-run-1',
    });

    expect(context.history).toEqual([{ role: 'user', parts: [{ type: 'text', text: 'fix the bug' }] }]);
  });

  it('appends context beneath the task description when provided', () => {
    const context = createSubAgentRunContext({
      agentProfile: baseProfile,
      delegation: { target_agent: 'coder', task_description: 'fix the bug', context: 'see src/foo.ts' },
      toolRegistry: registryWithBothTools(),
      runIdFactory: () => 'sub-run-1',
    });

    expect(context.history[0]?.parts[0]).toEqual({
      type: 'text',
      text: 'fix the bug\n\nContext:\nsee src/foo.ts',
    });
  });

  it('resolves tools against the allowlist, excluding tools outside it', () => {
    const context = createSubAgentRunContext({
      agentProfile: baseProfile,
      delegation: { target_agent: 'coder', task_description: 'x' },
      toolRegistry: registryWithBothTools(),
    });

    expect(context.tools.map((t) => t.name)).toEqual(['read_file']);
  });

  it('grants every registered tool when the profile has no allowlist', () => {
    const context = createSubAgentRunContext({
      agentProfile: { ...baseProfile, toolAllowlist: undefined },
      delegation: { target_agent: 'coder', task_description: 'x' },
      toolRegistry: registryWithBothTools(),
    });

    expect(context.tools.map((t) => t.name).sort()).toEqual(['read_file', 'write_file']);
  });

  it('gives the sub-run a fresh idle state machine and its own step tracker seeded from stepBudget', () => {
    const context = createSubAgentRunContext({
      agentProfile: baseProfile,
      delegation: { target_agent: 'coder', task_description: 'x' },
      toolRegistry: registryWithBothTools(),
    });

    expect(context.stateMachine.current).toBe('idle');
    expect(context.stepTracker.current).toBe(0);
    for (let i = 0; i < 5; i++) context.stepTracker.next();
    expect(context.stepTracker.isReached).toBe(true);
  });

  it('produces independent run ids across two contexts by default', () => {
    const a = createSubAgentRunContext({
      agentProfile: baseProfile,
      delegation: { target_agent: 'coder', task_description: 'x' },
      toolRegistry: registryWithBothTools(),
    });
    const b = createSubAgentRunContext({
      agentProfile: baseProfile,
      delegation: { target_agent: 'coder', task_description: 'x' },
      toolRegistry: registryWithBothTools(),
    });

    expect(a.runId).not.toBe(b.runId);
  });
});
