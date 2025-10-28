import { describe, expect, it, vi } from 'vitest';
import { ConnectorSupervisor } from './connectorSupervisor';

const noSleep = async (): Promise<void> => undefined;

describe('ConnectorSupervisor.start', () => {
  it('marks the connector running on a successful start', async () => {
    const supervisor = new ConnectorSupervisor('c1', { start: vi.fn().mockResolvedValue(undefined), sleep: noSleep });
    await supervisor.start();
    expect(supervisor.getHealth()).toMatchObject({ state: 'running', consecutiveFailures: 0 });
  });

  it('marks the connector unavailable and rethrows on a failed first start', async () => {
    const start = vi.fn().mockRejectedValue(new Error('spawn failed'));
    const supervisor = new ConnectorSupervisor('c1', { start, sleep: noSleep });
    await expect(supervisor.start()).rejects.toThrow('spawn failed');
    expect(supervisor.getHealth()).toMatchObject({ state: 'unavailable', consecutiveFailures: 1 });
  });
});

describe('ConnectorSupervisor.notifyCrashed', () => {
  it('restarts successfully and resets the failure count', async () => {
    const start = vi.fn().mockResolvedValue(undefined);
    const supervisor = new ConnectorSupervisor('c1', { start, sleep: noSleep });
    await supervisor.start();

    await supervisor.notifyCrashed(new Error('died'));

    expect(start).toHaveBeenCalledTimes(2);
    expect(supervisor.getHealth()).toMatchObject({ state: 'running', consecutiveFailures: 0 });
  });

  it('marks unavailable after exceeding maxConsecutiveFailures without restarting further', async () => {
    const start = vi.fn().mockRejectedValue(new Error('still broken'));
    const supervisor = new ConnectorSupervisor('c1', {
      start: vi.fn().mockResolvedValue(undefined),
      maxConsecutiveFailures: 2,
      sleep: noSleep,
    });
    await supervisor.start();

    // Replace start with a failing implementation for the crash-restart path.
    (supervisor as unknown as { options: { start: typeof start } }).options.start = start;

    await supervisor.notifyCrashed(new Error('crash 1'));

    expect(supervisor.getHealth().state).toBe('unavailable');
    expect(supervisor.getHealth().consecutiveFailures).toBeGreaterThan(2);
    expect(start).toHaveBeenCalledTimes(2); // 2 attempts before exceeding maxConsecutiveFailures(2)
  });

  it('does not restart once stopped', async () => {
    const start = vi.fn().mockResolvedValue(undefined);
    const supervisor = new ConnectorSupervisor('c1', { start, sleep: noSleep });
    await supervisor.start();
    supervisor.stop();

    await supervisor.notifyCrashed(new Error('post-stop crash'));

    expect(supervisor.getHealth().state).toBe('stopped');
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('reset clears failure tracking and returns to starting', async () => {
    const start = vi.fn().mockRejectedValue(new Error('bad'));
    const supervisor = new ConnectorSupervisor('c1', { start, sleep: noSleep });
    await supervisor.start().catch(() => undefined);
    expect(supervisor.getHealth().state).toBe('unavailable');

    supervisor.reset();
    expect(supervisor.getHealth()).toEqual({ connectorId: 'c1', state: 'starting', consecutiveFailures: 0 });
  });

  it('does not run two restart attempts concurrently', async () => {
    let resolveStart: (() => void) | undefined;
    const start = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveStart = resolve;
        }),
    );
    const supervisor = new ConnectorSupervisor('c1', { start: vi.fn().mockResolvedValue(undefined), sleep: noSleep });
    await supervisor.start();
    (supervisor as unknown as { options: { start: typeof start } }).options.start = start;

    const first = supervisor.notifyCrashed();
    const second = supervisor.notifyCrashed();

    while (start.mock.calls.length === 0) {
      await Promise.resolve();
    }
    resolveStart?.();
    await Promise.all([first, second]);

    expect(start).toHaveBeenCalledTimes(1);
  });
});
