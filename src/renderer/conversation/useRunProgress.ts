import { useEffect, useRef, useState } from 'react';
import { IPC_CHANNELS } from '@shared/ipc/channels';

const TERMINAL_STATES = new Set(['completed', 'failed', 'aborted']);

export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface RunProgress {
  running: boolean;
  currentStep: number;
  elapsedSeconds: number;
  usage: UsageTotals;
}

const ZERO_USAGE: UsageTotals = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

/**
 * Derives a run's live progress entirely from `run:stream` events for
 * `activeRunId`: whether it is still running, the most recent step
 * number a `state-change` event reported, cumulative token usage from
 * `usage` events, and elapsed wall-clock time ticking once a second from
 * the first event observed until a terminal state arrives.
 */
export function useRunProgress(activeRunId?: string): RunProgress {
  const [running, setRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [usage, setUsage] = useState<UsageTotals>(ZERO_USAGE);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startedAtRef = useRef<number | undefined>(undefined);

  // Reset progress synchronously during render when `activeRunId` changes,
  // per React's "adjusting state when a prop changes" pattern — not in an
  // effect, so this never causes an extra render showing stale progress
  // from the previous run before the reset takes effect.
  const [trackedRunId, setTrackedRunId] = useState(activeRunId);
  if (trackedRunId !== activeRunId) {
    setTrackedRunId(activeRunId);
    setRunning(false);
    setCurrentStep(0);
    setUsage(ZERO_USAGE);
    setElapsedSeconds(0);
  }

  useEffect(() => {
    startedAtRef.current = undefined;

    if (!window.electronAPI) return undefined;

    const unsubscribe = window.electronAPI.subscribe(IPC_CHANNELS.RUN_STREAM, (batch) => {
      if (!activeRunId) return;

      for (const event of batch) {
        if (!('runId' in event) || event.runId !== activeRunId) continue;

        if (event.type === 'state-change') {
          startedAtRef.current ??= Date.now();
          setRunning(!TERMINAL_STATES.has(event.state));
          if (event.step !== undefined) setCurrentStep(event.step);
        } else if (event.type === 'usage') {
          setUsage({
            promptTokens: event.promptTokens,
            completionTokens: event.completionTokens,
            totalTokens: event.totalTokens,
          });
        }
      }
    });

    return unsubscribe;
  }, [activeRunId]);

  useEffect(() => {
    if (!running) return undefined;

    const interval = setInterval(() => {
      if (startedAtRef.current !== undefined) {
        setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [running]);

  return { running, currentStep, elapsedSeconds, usage };
}
