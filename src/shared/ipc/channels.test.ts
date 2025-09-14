import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS, isKnownChannel } from './channels';

describe('IPC_CHANNELS', () => {
  it('has no duplicate channel name values', () => {
    const values = Object.values(IPC_CHANNELS);
    expect(new Set(values).size).toBe(values.length);
  });

  it('recognizes every declared channel as known', () => {
    for (const channel of Object.values(IPC_CHANNELS)) {
      expect(isKnownChannel(channel)).toBe(true);
    }
  });

  it('rejects an arbitrary string not present in the registry', () => {
    expect(isKnownChannel('not:a:real:channel')).toBe(false);
  });
});
