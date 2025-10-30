/**
 * Source for an in-repo mock ACP agent, run as a standalone Node child
 * process via `node -e`. Implements just enough of the protocol surface
 * to exercise the full client-side flow end to end: `initialize`,
 * `session/new`, `session/prompt` (streaming `session/update`
 * notifications back before replying), and `session/cancel`.
 *
 * Kept as a plain string (rather than a separate fixture file spawned
 * by path) so the integration test has no separate build step and no
 * risk of drifting out of sync with a compiled artifact.
 */
export const MOCK_ACP_AGENT_SCRIPT = `
process.stdin.setEncoding('utf-8');
let buffer = '';
let sessionCounter = 0;
let cancelled = false;

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\\n');
}

function sendUpdate(sessionId, update) {
  send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId, update } });
}

process.stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\\n');
  buffer = lines.pop();

  for (const line of lines) {
    if (!line.trim()) continue;
    const msg = JSON.parse(line);

    if (msg.method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: { protocolVersion: 1, agentCapabilities: { loadSession: true } },
      });
      continue;
    }

    if (msg.method === 'session/new') {
      sessionCounter += 1;
      send({ jsonrpc: '2.0', id: msg.id, result: { sessionId: 'mock-session-' + sessionCounter } });
      continue;
    }

    if (msg.method === 'session/prompt') {
      const sessionId = msg.params.sessionId;
      cancelled = false;

      sendUpdate(sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hello, ' } });

      setTimeout(() => {
        if (cancelled) return;
        sendUpdate(sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'world!' } });
        sendUpdate(sessionId, {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-1',
          title: 'read_file',
          status: 'completed',
        });
        send({ jsonrpc: '2.0', id: msg.id, result: { stopReason: 'end_turn' } });
      }, 20);
      continue;
    }

    if (msg.method === 'session/cancel') {
      cancelled = true;
      continue;
    }
  }
});
`;
