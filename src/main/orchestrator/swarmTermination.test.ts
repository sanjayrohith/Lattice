import { describe, expect, it } from 'vitest';
import type { SwarmTurn } from './swarmMode';
import { detectStall, detectSwarmTermination } from './swarmTermination';

function turn(message: string, agentId = 'a'): SwarmTurn {
  return { turnIndex: 0, agentId, message };
}

describe('detectStall', () => {
  it('returns false with fewer turns than the window', () => {
    expect(detectStall([turn('x')], 3)).toBe(false);
  });

  it('returns true when the most recent window turns share an identical message', () => {
    const transcript = [turn('a'), turn('same'), turn('same'), turn('same')];
    expect(detectStall(transcript, 3)).toBe(true);
  });

  it('returns false when the most recent window turns differ', () => {
    const transcript = [turn('a'), turn('b'), turn('c')];
    expect(detectStall(transcript, 3)).toBe(false);
  });

  it('ignores surrounding whitespace when comparing messages', () => {
    const transcript = [turn('  same  '), turn('same'), turn(' same')];
    expect(detectStall(transcript, 3)).toBe(true);
  });

  it('is disabled by a window of 0', () => {
    const transcript = [turn('x'), turn('x'), turn('x')];
    expect(detectStall(transcript, 0)).toBe(false);
  });
});

describe('detectSwarmTermination', () => {
  it('prioritizes consensus over the round cap', () => {
    const transcript = [turn('a'), turn('b')];
    const reason = detectSwarmTermination(transcript, { maxTurns: 2, consensusDetector: () => true });
    expect(reason).toBe('consensus');
  });

  it('falls back to the round cap once transcript length reaches maxTurns', () => {
    const transcript = [turn('a'), turn('b')];
    const reason = detectSwarmTermination(transcript, { maxTurns: 2 });
    expect(reason).toBe('round-cap');
  });

  it('detects a stall before the round cap is reached', () => {
    const transcript = [turn('same'), turn('same'), turn('same')];
    const reason = detectSwarmTermination(transcript, { maxTurns: 10, stallWindow: 3 });
    expect(reason).toBe('stall');
  });

  it('returns undefined when nothing warrants termination', () => {
    const transcript = [turn('a'), turn('b')];
    const reason = detectSwarmTermination(transcript, { maxTurns: 10 });
    expect(reason).toBeUndefined();
  });

  it('the round cap always guarantees a definite outcome regardless of other config', () => {
    const transcript = [turn('a'), turn('b'), turn('c')];
    const reason = detectSwarmTermination(transcript, {
      maxTurns: 3,
      consensusDetector: () => false,
      stallWindow: 0,
    });
    expect(reason).toBe('round-cap');
  });
});
