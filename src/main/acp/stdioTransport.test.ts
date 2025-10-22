import { describe, expect, it } from 'vitest';
import { StdioTransport, type StdioTransportEvent } from './stdioTransport';

function waitFor<T>(collect: () => T | undefined, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = (): void => {
      const value = collect();
      if (value !== undefined) {
        resolve(value);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('timed out waiting for condition'));
        return;
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

describe('StdioTransport', () => {
  it('pipes newline-delimited JSON-RPC over a spawned node child process', async () => {
    const script = `
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', (line) => {
        const msg = JSON.parse(line);
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { echo: msg.params } }) + '\\n');
      });
      process.stderr.write('child ready\\n');
    `;

    const transport = new StdioTransport({ command: process.execPath, args: ['-e', script] });
    const events: StdioTransportEvent[] = [];
    transport.onEvent((event) => events.push(event));
    transport.start();

    await waitFor(() => events.find((e) => e.type === 'stderr'));
    expect(transport.isRunning).toBe(true);

    transport.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', params: { hi: true } }) + '\n');

    const messageEvent = await waitFor(() =>
      events.find((e): e is Extract<StdioTransportEvent, { type: 'message' }> => e.type === 'message'),
    );
    expect(messageEvent.message).toMatchObject({ id: 1, result: { echo: { hi: true } } });

    transport.stop();
  });

  it('surfaces malformed frames as decode-error events without crashing', async () => {
    const script = `process.stdout.write('not json\\n');`;
    const transport = new StdioTransport({ command: process.execPath, args: ['-e', script] });
    const events: StdioTransportEvent[] = [];
    transport.onEvent((event) => events.push(event));
    transport.start();

    const decodeError = await waitFor(() =>
      events.find((e): e is Extract<StdioTransportEvent, { type: 'decode-error' }> => e.type === 'decode-error'),
    );
    expect(decodeError.error.raw).toBe('not json');
    transport.stop();
  });

  it('throws if started twice', () => {
    const transport = new StdioTransport({ command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'] });
    transport.start();
    expect(() => transport.start()).toThrow();
    transport.stop();
  });
});
