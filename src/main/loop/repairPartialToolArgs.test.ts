import { describe, expect, it } from 'vitest';
import { PartialToolArgsTracker, repairPartialJson } from './repairPartialToolArgs';

describe('repairPartialJson', () => {
  it('parses complete, well-formed JSON', () => {
    expect(repairPartialJson('{"path":"a.txt"}')).toEqual({ path: 'a.txt' });
  });

  it('repairs an unterminated string value', () => {
    expect(repairPartialJson('{"path": "a.tx')).toEqual({ path: 'a.tx' });
  });

  it('repairs a dangling key with no value yet', () => {
    const result = repairPartialJson('{"path": "a.txt", "limi') as Record<string, unknown>;
    expect(result['path']).toBe('a.txt');
  });

  it('repairs an unclosed object', () => {
    expect(repairPartialJson('{"a":1,"b":2')).toEqual({ a: 1, b: 2 });
  });

  it('repairs an unclosed array', () => {
    expect(repairPartialJson('{"items":[1,2,3')).toEqual({ items: [1, 2, 3] });
  });

  it('returns undefined for an empty string', () => {
    expect(repairPartialJson('')).toBeUndefined();
  });

  it('returns undefined for whitespace only', () => {
    expect(repairPartialJson('   ')).toBeUndefined();
  });

  it('returns undefined for input too malformed to repair', () => {
    expect(repairPartialJson('}{]][[')).toBeUndefined();
  });
});

describe('PartialToolArgsTracker', () => {
  it('emits a progressively more complete object as chunks accumulate', () => {
    const tracker = new PartialToolArgsTracker();

    expect(tracker.append('{"path"')).toEqual({ path: null });
    expect(tracker.append(': "a.t')).toEqual({ path: 'a.t' });
    expect(tracker.append('xt", "limit": 1')).toEqual({ path: 'a.txt', limit: 1 });
    expect(tracker.append('0}')).toEqual({ path: 'a.txt', limit: 10 });
  });

  it('exposes the raw accumulated buffer', () => {
    const tracker = new PartialToolArgsTracker();
    tracker.append('{"a":');
    tracker.append('1}');

    expect(tracker.raw).toBe('{"a":1}');
  });

  it('resets the buffer, starting the next call fresh', () => {
    const tracker = new PartialToolArgsTracker();
    tracker.append('{"a":1}');
    tracker.reset();

    expect(tracker.raw).toBe('');
    expect(tracker.append('{"b":2}')).toEqual({ b: 2 });
  });
});
