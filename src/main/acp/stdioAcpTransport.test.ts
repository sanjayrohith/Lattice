import { describe, expect, it } from 'vitest';
import { StdioAcpTransport } from './stdioAcpTransport';

describe('StdioAcpTransport', () => {
  it('correlates a request against the child process response by id', async () => {
    const script = `
      process.stdin.setEncoding('utf-8');
      let buf = '';
      process.stdin.on('data', (chunk) => {
        buf += chunk;
        const lines = buf.split('\\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line);
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: 1 } }) + '\\n');
        }
      });
    `;
    const transport = new StdioAcpTransport({ command: process.execPath, args: ['-e', script] });

    const result = await transport.sendRequest('initialize', { protocolVersion: 1 });
    expect(result).toEqual({ protocolVersion: 1 });

    transport.close();
  });

  it('routes an inbound peer request to onPeerMessage and responds via respond()', async () => {
    const script = `
      process.stdin.setEncoding('utf-8');
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 'peer-1', method: 'fs/read_text_file', params: { path: '/a' } }) + '\\n');
      process.stdin.on('data', (chunk) => {
        // swallow the client's response frame
      });
    `;
    const transport = new StdioAcpTransport({ command: process.execPath, args: ['-e', script] });

    const capture = await new Promise<{ method: string; params: unknown }>((resolve) => {
      transport.onPeerMessage((method, params, respond) => {
        resolve({ method, params });
        respond?.({ content: 'hello' });
      });
    });

    expect(capture).toEqual({ method: 'fs/read_text_file', params: { path: '/a' } });
    transport.close();
  });
});
