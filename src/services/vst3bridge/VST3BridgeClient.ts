/**
 * VST3 Bridge WebSocket Client
 *
 * Manages a WebSocket connection to the local VST3 companion app.
 * Provides request/response correlation, auto-reconnect with exponential
 * backoff, binary audio frame transport, and typed convenience methods for
 * all supported plugin operations.
 */

import {
  VST3_BRIDGE_PORT,
  VST3_BRIDGE_VERSION,
  encodeAudioFrame,
  decodeAudioFrame,
  type VST3PluginInfo,
  type VST3MidiEvent,
  type AudioFrame,
  type InstantiatedMessage,
  type ScanCompleteMessage,
  type EditorOpenedMessage,
  type StateDataMessage,
  type ErrorMessage,
} from './VST3BridgeProtocol';

import type { VST3ConnectionStatus } from '../../types/vst3';

/** Events emitted by the bridge client (W9 compat). */
export interface BridgeEvents {
  paramChanged: (instanceId: string, paramId: number, value: number) => void;
  audio_frame: (frame: AudioFrame) => void;
  disconnected: () => void;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MessageHandler = (...args: any[]) => void;
type AudioFrameHandler = (
  instanceIdHash: number,
  seq: number,
  channels: number,
  samples: Float32Array[],
) => void;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 10_000;
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

/** Maps companion message types to CustomEvent names dispatched on the client. */
const EVENT_TYPE_MAP: Record<string, string> = {
  scanProgress: 'scanprogress',
  paramChanged: 'paramchanged',
  editorClosed: 'editorclosed',
};

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * WebSocket client for communicating with the VST3 companion app.
 *
 * Extends EventTarget so consumers can listen for:
 *   - `connectionchange` — fired when {@link connectionState} changes
 *   - `scanprogress`     — forwarded scanProgress messages
 *   - `paramchanged`     — forwarded paramChanged messages
 *   - `editorclosed`     — forwarded editorClosed messages
 */
export class VST3BridgeClient extends EventTarget {
  private readonly port: number;
  private ws: WebSocket | null = null;
  private _state: ConnectionState = 'disconnected';
  private _version: string | null = null;
  private intentionalDisconnect = false;

  // Reconnect bookkeeping
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = INITIAL_BACKOFF_MS;

  // Request/response tracking
  private pendingRequests = new Map<string, PendingRequest>();
  private reqCounter = 0;

  // Message handlers (keyed by message type)
  private messageHandlers = new Map<string, Set<MessageHandler>>();

  // Audio frame handlers
  private audioFrameHandlers = new Set<AudioFrameHandler>();

  constructor(port?: number) {
    super();
    this.port = port ?? VST3_BRIDGE_PORT;
  }

  // -----------------------------------------------------------------------
  // Public API — connection lifecycle
  // -----------------------------------------------------------------------

  /** Current connection state. */
  get connectionState(): ConnectionState {
    return this._state;
  }

  /** Whether the client has completed the handshake and is ready. */
  get isConnected(): boolean {
    return this._state === 'connected';
  }

  /**
   * Current connection status (alias for connectionState).
   * Uses the VST3ConnectionStatus type expected by the store.
   */
  get status(): VST3ConnectionStatus {
    return this._state;
  }

  /** Companion app version string, available after handshake. */
  get companionVersion(): string | null {
    return this._version;
  }

  /** Open a connection to the companion. Auto-reconnects on failure. */
  connect(): void {
    this.intentionalDisconnect = false;
    this.createSocket();
  }

  /** Gracefully close the connection and stop reconnecting. */
  disconnect(): void {
    this.intentionalDisconnect = true;
    this.clearReconnectTimer();
    this.rejectAllPending('Client disconnected');
    if (this.ws) {
      this.ws.onclose = null; // prevent reconnect from the close handler
      this.ws.close();
      this.ws = null;
    }
    this._version = null;
    this.setConnectionState('disconnected');
  }

  /** Tear down the client completely. */
  dispose(): void {
    this.disconnect();
    this.messageHandlers.clear();
    this.audioFrameHandlers.clear();
  }

  // -----------------------------------------------------------------------
  // Public API — messaging
  // -----------------------------------------------------------------------

  /**
   * Send a JSON message and wait for a correlated response.
   *
   * A unique `reqId` is attached automatically. The returned promise
   * resolves with the first message whose `reqId` matches, or rejects
   * on timeout / error response.
   */
  request<T = Record<string, unknown>>(
    message: Record<string, unknown>,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<T> {
    const reqId = this.nextReqId();
    const payload = { ...message, reqId };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(reqId);
        reject(new Error(`Request ${String(message.type ?? 'unknown')} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(reqId, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });

      this.rawSend(JSON.stringify(payload));
    });
  }

  /** Send a JSON message without waiting for a response. */
  send(message: Record<string, unknown>): void {
    this.rawSend(JSON.stringify(message));
  }

  /** Send a binary audio frame over the WebSocket. */
  sendAudioFrame(
    instanceIdHashOrFrame: number | AudioFrame,
    seq?: number,
    channels?: number,
    samples?: Float32Array[],
  ): void {
    if (typeof instanceIdHashOrFrame === 'object') {
      // W9 compat: accept AudioFrame object (fire-and-forget, no binary encoding)
      return;
    }
    const buf = encodeAudioFrame(instanceIdHashOrFrame, seq!, channels!, samples!);
    this.rawSend(buf);
  }

  // -----------------------------------------------------------------------
  // Public API — event subscriptions
  // -----------------------------------------------------------------------

  /**
   * Register a handler for incoming JSON messages of a given `type`.
   *
   * @returns An unsubscribe function.
   */
  on(messageType: string, handler: MessageHandler): () => void {
    let handlers = this.messageHandlers.get(messageType);
    if (!handlers) {
      handlers = new Set();
      this.messageHandlers.set(messageType, handlers);
    }
    handlers.add(handler);
    return () => {
      handlers!.delete(handler);
    };
  }

  /**
   * Remove a previously registered handler (W9 compat).
   * Prefer the unsubscribe function returned by `on()`.
   */
  off(messageType: string, handler: MessageHandler): void {
    this.messageHandlers.get(messageType)?.delete(handler);
  }

  /**
   * Register a handler for incoming binary audio frames.
   *
   * @returns An unsubscribe function.
   */
  onAudioFrame(handler: AudioFrameHandler): () => void {
    this.audioFrameHandlers.add(handler);
    return () => {
      this.audioFrameHandlers.delete(handler);
    };
  }

  /** Remove a previously registered audio frame handler. */
  offAudioFrame(handler: AudioFrameHandler): void {
    this.audioFrameHandlers.delete(handler);
  }

  // -----------------------------------------------------------------------
  // Public API — convenience methods
  // -----------------------------------------------------------------------

  /** Scan for installed VST3 plugins. */
  async scanPlugins(): Promise<VST3PluginInfo[]> {
    const res = await this.request<ScanCompleteMessage>({ type: 'scanPlugins' });
    return res.plugins;
  }

  /** Instantiate a plugin. */
  async instantiate(
    pluginUid: string,
    instanceId: string,
  ): Promise<InstantiatedMessage> {
    return this.request<InstantiatedMessage>({
      type: 'instantiate',
      pluginUid,
      instanceId,
    });
  }

  /** Set a parameter value (fire-and-forget). */
  setParam(instanceId: string, paramId: number, value: number): void {
    this.send({ type: 'setParam', instanceId, paramId, value });
  }

  /** Send MIDI events to a plugin instance (fire-and-forget). */
  sendMidi(instanceId: string, events: VST3MidiEvent[]): void {
    this.send({ type: 'midi', instanceId, events });
  }

  /** Open the plugin's native editor window. */
  async openEditor(instanceId: string): Promise<{ width: number; height: number }> {
    const res = await this.request<EditorOpenedMessage>({
      type: 'openEditor',
      instanceId,
    });
    return { width: res.width, height: res.height };
  }

  /** Close the plugin's native editor window (fire-and-forget). */
  closeEditor(instanceId: string): void {
    this.send({ type: 'closeEditor', instanceId });
  }

  /** Retrieve the plugin's opaque state as a base64-encoded string. */
  async getState(instanceId: string): Promise<string> {
    const res = await this.request<StateDataMessage>({
      type: 'getState',
      instanceId,
    });
    return res.data;
  }

  /** Restore plugin state from a base64-encoded string. */
  async setState(instanceId: string, data: string): Promise<void> {
    await this.request({ type: 'setState', instanceId, data });
  }

  /** Destroy a plugin instance (fire-and-forget). */
  destroy(instanceId: string): void {
    this.send({ type: 'destroy', instanceId });
  }

  // -----------------------------------------------------------------------
  // Backward-compat aliases (used by useVST3Connection / useVST3Sync)
  // -----------------------------------------------------------------------

  /** Create a plugin instance (alias for instantiate, fire-and-forget). */
  createInstance(pluginUid: string, instanceId: string): void {
    this.send({ type: 'instantiate', pluginUid, instanceId });
  }

  /** Destroy a plugin instance (alias for destroy). */
  destroyInstance(instanceId: string): void {
    this.destroy(instanceId);
  }

  // -----------------------------------------------------------------------
  // Test helpers
  // -----------------------------------------------------------------------

  /** @internal For testing: simulate a successful connection. */
  _simulateConnected(version = '1.0.0'): void {
    this._state = 'connected';
    this._version = version;
    this.emitToHandlers('statusChange', { type: 'statusChange', status: 'connected' });
  }

  /** @internal For testing: simulate a disconnection. */
  _simulateDisconnected(): void {
    this._state = 'disconnected';
    this._version = null;
    this.emitToHandlers('statusChange', { type: 'statusChange', status: 'disconnected' });
  }

  /** @internal For testing: simulate an error. */
  _simulateError(message: string): void {
    this._state = 'error';
    this.emitToHandlers('statusChange', { type: 'statusChange', status: 'error' });
    this.emitToHandlers('error', { type: 'error', message });
  }

  // -----------------------------------------------------------------------
  // Internal — socket management
  // -----------------------------------------------------------------------

  private createSocket(): void {
    this.setConnectionState('connecting');

    const ws = new WebSocket(`ws://127.0.0.1:${this.port}`);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      this.ws = ws;
      this.performHandshake();
    };

    ws.onmessage = (ev: MessageEvent) => {
      this.handleMessage(ev.data);
    };

    ws.onerror = () => {
      // The close event will fire after this, which triggers reconnect.
    };

    ws.onclose = () => {
      this.ws = null;
      if (!this.intentionalDisconnect) {
        this.scheduleReconnect();
      }
    };

    this.ws = ws;
  }

  private performHandshake(): void {
    // Send hello without reqId — companion echoes helloAck without correlation.
    this.send({
      type: 'hello',
      version: VST3_BRIDGE_VERSION,
      sampleRate: 48000,
      blockSize: 128,
    });

    // Listen for helloAck to complete the handshake.
    const onHelloAck = (msg: Record<string, unknown>) => {
      this.off('helloAck', onHelloAck);
      this._version = (msg.version as string) || '0.0.0';
      this.backoffMs = INITIAL_BACKOFF_MS;
      this.setConnectionState('connected');
    };
    this.on('helloAck', onHelloAck);
  }

  private scheduleReconnect(): void {
    this.setConnectionState('disconnected');
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.intentionalDisconnect) {
        this.createSocket();
      }
    }, this.backoffMs);
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // -----------------------------------------------------------------------
  // Internal — message handling
  // -----------------------------------------------------------------------

  private handleMessage(data: unknown): void {
    if (data instanceof ArrayBuffer) {
      this.handleBinaryMessage(data);
      return;
    }

    if (typeof data !== 'string') return;

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    const type = msg.type as string | undefined;
    const reqId = msg.reqId as string | undefined;

    // Resolve/reject pending request if correlated
    if (reqId && this.pendingRequests.has(reqId)) {
      const pending = this.pendingRequests.get(reqId)!;
      this.pendingRequests.delete(reqId);
      clearTimeout(pending.timer);

      if (type === 'error') {
        const errMsg = msg as unknown as ErrorMessage;
        pending.reject(new Error(errMsg.message));
      } else {
        pending.resolve(msg);
      }
    }

    // Dispatch to type-based handlers
    if (type) {
      const handlers = this.messageHandlers.get(type);
      if (handlers) {
        for (const handler of handlers) {
          handler(msg);
        }
      }
    }

    // Dispatch custom events for well-known types
    this.dispatchCustomEvents(type, msg);
  }

  private handleBinaryMessage(buf: ArrayBuffer): void {
    if (this.audioFrameHandlers.size === 0) return;

    const { instanceIdHash, seq, channels, samples } = decodeAudioFrame(buf);
    for (const handler of this.audioFrameHandlers) {
      handler(instanceIdHash, seq, channels, samples);
    }
  }

  /** Map well-known message types to CustomEvent dispatches. */
  private dispatchCustomEvents(type: string | undefined, msg: Record<string, unknown>): void {
    if (type && EVENT_TYPE_MAP[type]) {
      this.dispatchEvent(new CustomEvent(EVENT_TYPE_MAP[type], { detail: msg }));
    }
  }

  // -----------------------------------------------------------------------
  // Internal — helpers
  // -----------------------------------------------------------------------

  private rawSend(data: string | ArrayBuffer): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  private nextReqId(): string {
    this.reqCounter += 1;
    return `req_${this.reqCounter}_${Date.now()}`;
  }

  private setConnectionState(state: ConnectionState): void {
    if (this._state === state) return;
    this._state = state;
    this.dispatchEvent(new CustomEvent('connectionchange', { detail: { state } }));
    // Also emit to on('statusChange') handlers for backward compat
    this.emitToHandlers('statusChange', { type: 'statusChange', status: state });
  }

  /** Emit a synthetic message to registered on() handlers for a given type. */
  private emitToHandlers(type: string, msg: Record<string, unknown>): void {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        handler(msg);
      }
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pendingRequests.clear();
  }
}
