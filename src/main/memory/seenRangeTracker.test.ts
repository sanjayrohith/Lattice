import { describe, expect, it } from 'vitest';
import { SeenRangeTracker } from './seenRangeTracker';

describe('SeenRangeTracker', () => {
  it('reports a range as uncovered before anything is marked seen', () => {
    const tracker = new SeenRangeTracker();
    expect(tracker.isFullyCovered('a.ts', { startLine: 1, endLine: 5 })).toBe(false);
  });

  it('reports a range as covered once it has been marked seen', () => {
    const tracker = new SeenRangeTracker();
    tracker.markSeen('a.ts', { startLine: 1, endLine: 20 });
    expect(tracker.isFullyCovered('a.ts', { startLine: 5, endLine: 10 })).toBe(true);
  });

  it('does not consider a range covered by a seen range in a different file', () => {
    const tracker = new SeenRangeTracker();
    tracker.markSeen('a.ts', { startLine: 1, endLine: 20 });
    expect(tracker.isFullyCovered('b.ts', { startLine: 1, endLine: 20 })).toBe(false);
  });

  it('merges adjacent and overlapping marks so a range spanning both is covered', () => {
    const tracker = new SeenRangeTracker();
    tracker.markSeen('a.ts', { startLine: 1, endLine: 10 });
    tracker.markSeen('a.ts', { startLine: 11, endLine: 20 });
    expect(tracker.isFullyCovered('a.ts', { startLine: 1, endLine: 20 })).toBe(true);
  });

  it('does not report a range as covered when only part of it has been seen', () => {
    const tracker = new SeenRangeTracker();
    tracker.markSeen('a.ts', { startLine: 1, endLine: 5 });
    expect(tracker.isFullyCovered('a.ts', { startLine: 1, endLine: 10 })).toBe(false);
  });

  it('forgets everything after reset', () => {
    const tracker = new SeenRangeTracker();
    tracker.markSeen('a.ts', { startLine: 1, endLine: 20 });
    tracker.reset();
    expect(tracker.isFullyCovered('a.ts', { startLine: 1, endLine: 20 })).toBe(false);
  });
});
