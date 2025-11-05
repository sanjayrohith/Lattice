import type { SwarmTurn } from './swarmMode';

export type SwarmTerminationReason = 'consensus' | 'round-cap' | 'stall';

/** Detects that the swarm has reached agreement; free-form, since "consensus" is mode-config-specific. */
export type ConsensusDetector = (transcript: readonly SwarmTurn[]) => boolean;

export interface SwarmTerminationConfig {
  maxTurns: number;
  consensusDetector?: ConsensusDetector;
  /** Number of most recent turns that, if identical, are considered a stall; `0` disables stall detection. */
  stallWindow?: number;
}

/**
 * A swarm has stalled when its most recent `window` turns are all the
 * same agent repeating the exact same message — a sign the
 * conversation is looping rather than progressing, distinct from
 * simply running long (which the round cap already handles).
 */
export function detectStall(transcript: readonly SwarmTurn[], window: number): boolean {
  if (window <= 0 || transcript.length < window) return false;

  const recent = transcript.slice(-window);
  const first = recent[0]?.message.trim();
  return recent.every((turn) => turn.message.trim() === first);
}

/**
 * Decides whether a free-communication swarm should stop after its
 * latest turn, checked in priority order: consensus first (the
 * intended, successful ending), then the round cap (the hard
 * ceiling that guarantees termination regardless of anything else),
 * then a stall (an unproductive loop worth cutting short even under
 * the cap). Returns `undefined` when none apply and the swarm should
 * continue.
 */
export function detectSwarmTermination(
  transcript: readonly SwarmTurn[],
  config: SwarmTerminationConfig,
): SwarmTerminationReason | undefined {
  if (config.consensusDetector?.(transcript)) {
    return 'consensus';
  }
  if (transcript.length >= config.maxTurns) {
    return 'round-cap';
  }
  if (config.stallWindow && detectStall(transcript, config.stallWindow)) {
    return 'stall';
  }
  return undefined;
}
