import { describe, expect, it } from 'vitest';
import { DEFAULT_STEP_CAP, StepCapReachedError, StepCapTracker } from './stepCap';

describe('StepCapTracker', () => {
  it('defaults to a cap of 25', () => {
    expect(new StepCapTracker().current).toBe(0);
    expect(DEFAULT_STEP_CAP).toBe(25);
  });

  it('advances the step count on each call to next()', () => {
    const tracker = new StepCapTracker(5);

    expect(tracker.next()).toBe(1);
    expect(tracker.next()).toBe(2);
    expect(tracker.current).toBe(2);
  });

  it('reports isReached once the cap is hit', () => {
    const tracker = new StepCapTracker(2);
    tracker.next();
    expect(tracker.isReached).toBe(false);
    tracker.next();
    expect(tracker.isReached).toBe(true);
  });

  it('throws StepCapReachedError instead of advancing past the cap', () => {
    const tracker = new StepCapTracker(1);
    tracker.next();

    expect(() => tracker.next()).toThrow(StepCapReachedError);
    expect(tracker.current).toBe(1);
  });

  it('names the configured cap on the thrown error', () => {
    const tracker = new StepCapTracker(3);
    tracker.next();
    tracker.next();
    tracker.next();

    try {
      tracker.next();
      expect.unreachable('expected next() to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(StepCapReachedError);
      expect((error as StepCapReachedError).cap).toBe(3);
      expect((error as StepCapReachedError).code).toBe('STEP_CAP_REACHED');
    }
  });

  it('respects a configured cap different from the default', () => {
    const tracker = new StepCapTracker(100);
    for (let i = 0; i < 99; i++) tracker.next();
    expect(tracker.isReached).toBe(false);
    tracker.next();
    expect(tracker.isReached).toBe(true);
  });

  it('rejects constructing a tracker with a cap below 1', () => {
    expect(() => new StepCapTracker(0)).toThrow(RangeError);
    expect(() => new StepCapTracker(-5)).toThrow(RangeError);
  });
});
