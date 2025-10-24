import { z } from 'zod';
import type { AcpTransport } from './acpTransport';

/** The protocol version this orchestrator implements and proposes during `initialize`. */
export const ACP_PROTOCOL_VERSION = 1;

export const acpCapabilitiesSchema = z.object({
  loadSession: z.boolean().optional(),
  promptCapabilities: z
    .object({
      image: z.boolean().optional(),
      audio: z.boolean().optional(),
    })
    .optional(),
});
export type AcpCapabilities = z.infer<typeof acpCapabilitiesSchema>;

const initializeResultSchema = z.object({
  protocolVersion: z.number().int(),
  agentCapabilities: acpCapabilitiesSchema.optional(),
});

/** Thrown when a method requiring a capability the peer never declared is invoked. */
export class AcpCapabilityError extends Error {
  constructor(public readonly capability: string) {
    super(`peer did not declare the "${capability}" capability`);
    this.name = 'AcpCapabilityError';
  }
}

/** Thrown when a method is called before `initialize` has completed. */
export class AcpNotInitializedError extends Error {
  constructor() {
    super('the ACP connection has not completed initialize');
    this.name = 'AcpNotInitializedError';
  }
}

/**
 * Drives the ACP handshake and holds the negotiated protocol version and
 * the peer's declared capabilities, which gate which subsequent methods
 * (e.g. `session/load`, image content blocks) the orchestrator may call.
 * Built on top of an {@link AcpTransport} so it works identically over
 * stdio or HTTP.
 */
export class AcpConnection {
  private negotiatedVersion: number | undefined;
  private peerCapabilities: AcpCapabilities = {};

  constructor(private readonly transport: AcpTransport) {}

  get isInitialized(): boolean {
    return this.negotiatedVersion !== undefined;
  }

  get protocolVersion(): number | undefined {
    return this.negotiatedVersion;
  }

  get capabilities(): AcpCapabilities {
    return this.peerCapabilities;
  }

  /**
   * Sends `initialize`, negotiates the lower of the two proposed
   * protocol versions, and retains the peer's declared capabilities.
   */
  async initialize(clientCapabilities?: AcpCapabilities): Promise<AcpCapabilities> {
    const rawResult = await this.transport.sendRequest('initialize', {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: clientCapabilities ?? {},
    });
    const result = initializeResultSchema.parse(rawResult);

    this.negotiatedVersion = Math.min(ACP_PROTOCOL_VERSION, result.protocolVersion);
    this.peerCapabilities = result.agentCapabilities ?? {};
    return this.peerCapabilities;
  }

  /** Throws {@link AcpNotInitializedError} unless `initialize` has already succeeded. */
  requireInitialized(): void {
    if (!this.isInitialized) throw new AcpNotInitializedError();
  }

  /** Throws {@link AcpCapabilityError} unless the peer declared `capability` as truthy. */
  requireCapability(capability: keyof AcpCapabilities): void {
    this.requireInitialized();
    if (!this.peerCapabilities[capability]) {
      throw new AcpCapabilityError(capability);
    }
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    return this.transport.sendRequest(method, params);
  }

  notify(method: string, params?: unknown): void {
    this.transport.sendNotification(method, params);
  }

  onPeerMessage(
    listener: (method: string, params: unknown, respond?: (result: unknown) => void) => void,
  ): () => void {
    return this.transport.onPeerMessage(listener);
  }

  close(): void {
    this.transport.close();
  }
}
