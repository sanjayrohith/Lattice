import { describe, expect, it } from 'vitest';
import { appendToolResults } from '../loop/reinjectToolResults';
import { AgentRunStateMachine } from '../loop/runStateMachine';
import { PendingDecisionRegistry } from '../loop/abortCleanup';
import { ConsentGate, type ConsentGateRequest } from '../consent/consentGate';
import { ConsentPolicyStore } from '../consent/consentPolicyStore';
import { dispatchToolCallWithConsent } from '../consent/dispatchWithConsent';
import { ToolRegistry } from '../tools/registry';
import { createMockMcpServer } from './__fixtures__/mockMcpServer';
import { McpClient } from './mcpClient';
import { discoverMcpTools, mergeMcpToolsIntoToolset } from './mcpToolDiscovery';
import type { McpServerConfig } from './mcpServerConfig';

const SERVER_CONFIG: McpServerConfig = {
  id: 'mock-server',
  displayName: 'Mock Server',
  enabled: true,
  transport: 'stdio',
  command: 'mock',
  args: [],
  env: {},
  consentOverrides: {},
};

describe('MCP end-to-end: discover, consent, invoke, reinject', () => {
  it('discovers the mock server tool, gates it through consent, invokes it, and reinjects the result', async () => {
    const mockServer = await createMockMcpServer();
    const client = new McpClient({ name: 'lattice', version: '0.1.0' });
    await client.connect(mockServer.clientTransport);

    try {
      // 1. Discovery, at the start of a turn.
      const discovered = await discoverMcpTools([SERVER_CONFIG], () => client);
      expect(discovered).toEqual([
        { serverId: 'mock-server', descriptor: expect.objectContaining({ name: 'greet' }) },
      ]);

      // 2. Namespacing + schema derivation, wrapped into the run's toolset.
      const tools = mergeMcpToolsIntoToolset([], discovered, () => client);
      expect(tools).toHaveLength(1);
      expect(tools[0]?.name).toBe('mcp__mock-server__greet');
      expect(tools[0]?.defaultConsent).toBe('ask');

      const registry = new ToolRegistry();
      tools.forEach((tool) => registry.register(tool));

      // 3. Consent gate: the tool is 'ask', so the call suspends until resolved.
      const stateMachine = new AgentRunStateMachine();
      stateMachine.transition('streaming');
      const pendingDecisions = new PendingDecisionRegistry<'accepted' | 'declined'>();
      let notified: ConsentGateRequest | undefined;
      const consentGate = new ConsentGate(new ConsentPolicyStore(), pendingDecisions, stateMachine, (_sessionId, request) => {
        notified = request;
      });

      const dispatchPromise = dispatchToolCallWithConsent(
        { toolCallId: 'call-1', toolName: 'mcp__mock-server__greet', input: { name: 'Lattice' } },
        registry,
        { workspaceRoot: '/workspace' },
        consentGate,
        'session-1',
      );

      await Promise.resolve();
      expect(stateMachine.current).toBe('awaiting-consent');
      expect(notified).toMatchObject({ toolCallId: 'call-1', toolName: 'mcp__mock-server__greet' });

      // The user accepts.
      pendingDecisions.resolve('call-1', 'accepted');
      const result = await dispatchPromise;

      // 4. Invocation actually ran the mock server's tool.
      expect(result.ok).toBe(true);
      expect(stateMachine.current).toBe('executing-tool');
      if (result.ok) {
        expect(result.output).toMatchObject({
          content: [{ type: 'text', text: 'Hello, Lattice!' }],
        });
      }

      // 5. Reinjection into the run's message history.
      const history = appendToolResults([], [result]);
      expect(history).toEqual([
        {
          role: 'tool',
          parts: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'mcp__mock-server__greet',
              output: result.ok ? result.output : undefined,
              isError: false,
            },
          ],
        },
      ]);
    } finally {
      await client.disconnect();
      await mockServer.close();
    }
  });

  it('declines the call when the user rejects consent, and never invokes the tool', async () => {
    const mockServer = await createMockMcpServer();
    const client = new McpClient({ name: 'lattice', version: '0.1.0' });
    await client.connect(mockServer.clientTransport);

    try {
      const discovered = await discoverMcpTools([SERVER_CONFIG], () => client);
      const tools = mergeMcpToolsIntoToolset([], discovered, () => client);
      const registry = new ToolRegistry();
      tools.forEach((tool) => registry.register(tool));

      const stateMachine = new AgentRunStateMachine();
      stateMachine.transition('streaming');
      const pendingDecisions = new PendingDecisionRegistry<'accepted' | 'declined'>();
      const consentGate = new ConsentGate(new ConsentPolicyStore(), pendingDecisions, stateMachine, () => undefined);

      const dispatchPromise = dispatchToolCallWithConsent(
        { toolCallId: 'call-2', toolName: 'mcp__mock-server__greet', input: { name: 'Lattice' } },
        registry,
        { workspaceRoot: '/workspace' },
        consentGate,
        'session-1',
      );

      await Promise.resolve();
      pendingDecisions.resolve('call-2', 'declined');
      const result = await dispatchPromise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('TOOL_DECLINED');
      }
      expect(stateMachine.current).toBe('streaming');
    } finally {
      await client.disconnect();
      await mockServer.close();
    }
  });
});
