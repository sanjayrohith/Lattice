import type { ElectronAPI } from './index';

export {};

declare global {
  interface Window {
    /**
     * The narrow, contextBridge-exposed API surface. This is the renderer's
     * only path into the main process; its shape is derived directly from
     * the preload implementation so it can never drift from what is
     * actually exposed at runtime.
     */
    readonly electronAPI: ElectronAPI;
  }
}
