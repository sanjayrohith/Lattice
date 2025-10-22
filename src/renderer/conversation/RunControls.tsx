import { useState } from 'react';
import type { UsageTotals } from './useRunProgress';

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export interface RunControlsProps {
  onSend: (text: string) => void;
  onStop: () => void;
  running: boolean;
  currentStep: number;
  stepCap: number;
  elapsedSeconds: number;
  usage: UsageTotals;
}

/**
 * The composer: a text input plus Send/Stop controls, and a live
 * readout of the current step against the run's step cap, elapsed
 * time, and cumulative token usage. Send is disabled while a run is
 * already in progress or the input is empty; Stop is only enabled while
 * one is running.
 */
export function RunControls({
  onSend,
  onStop,
  running,
  currentStep,
  stepCap,
  elapsedSeconds,
  usage,
}: RunControlsProps): React.JSX.Element {
  const [text, setText] = useState('');

  function handleSend(): void {
    const trimmed = text.trim();
    if (!trimmed || running) return;
    onSend(trimmed);
    setText('');
  }

  return (
    <div className="run-controls">
      <div className="run-controls__readout">
        <span className="run-controls__step" data-testid="run-controls-step">
          Step {currentStep} / {stepCap}
        </span>
        <span className="run-controls__elapsed" data-testid="run-controls-elapsed">
          {formatElapsed(elapsedSeconds)}
        </span>
        <span className="run-controls__usage" data-testid="run-controls-usage">
          {usage.totalTokens} tokens ({usage.promptTokens} prompt / {usage.completionTokens} completion)
        </span>
      </div>
      <div className="run-controls__composer">
        <textarea
          className="run-controls__input"
          aria-label="Message"
          value={text}
          disabled={running}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
        />
        <div className="run-controls__actions">
          <button type="button" disabled={running || text.trim().length === 0} onClick={handleSend}>
            Send
          </button>
          <button type="button" disabled={!running} onClick={onStop}>
            Stop
          </button>
        </div>
      </div>
    </div>
  );
}
