import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { RunStreamEvent } from '@shared/ipc/events';
import { RunEventBroadcaster } from './runEventBroadcaster';

/** The default flush interval: frequent enough to feel live, coarse enough to never flood the renderer. */
export const RUN_STREAM_FLUSH_INTERVAL_MS = 50;

/**
 * Builds the application's {@link RunEventBroadcaster}, wired to send
 * each coalesced batch to every open window via `run:stream` — the same
 * broadcast-to-all-windows pattern the state store uses for
 * `state:revision`.
 */
export function createRunEventBroadcaster(): RunEventBroadcaster {
  return new RunEventBroadcaster(RUN_STREAM_FLUSH_INTERVAL_MS, (batch: RunStreamEvent[]) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.RUN_STREAM, batch);
      }
    });
  });
}
