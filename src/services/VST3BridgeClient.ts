/**
 * VST3BridgeClient — WebSocket client for the VST3 companion app.
 *
 * Stub implementation. The real client will manage a WebSocket connection
 * to the local companion app that hosts VST3 plugins.
 */
import type { VST3ConnectionStatus, VST3PluginDescriptor, VST3ParamDescriptor } from '../types/vst3';

type EventMap = {
  statusChange: (status: VST3ConnectionStatus) => void;
  error: (error: string) => void;
  scanComplete: (plugins: VST3PluginDescriptor[]) => void;
  instanceCreated: (instanceId: string, params: VST3ParamDescriptor[]) => void;
  instanceDestroyed: (instanceId: string) => void;
  paramChanged: (instanceId: string, paramId: number, value: number) => void;
};

type EventName = keyof EventMap;

export class VST3BridgeClient {
  private _status: VST3ConnectionStatus = 'disconnected';
  private _version: string | null = null;
  private listeners = new Map<EventName, Set<EventMap[EventName]>>();

  get status(): VST3ConnectionStatus {
    return this._status;
  }

  get isConnected(): boolean {
    return this._status === 'connected';
  }

  get companionVersion(): string | null {
    return this._version;
  }

  /** Connect to the companion app. */
  async connect(_url?: string): Promise<void> {
    this._status = 'connecting';
    this.emit('statusChange', 'connecting');
    // Real implementation would open a WebSocket here.
    // For now, this is a stub that will be wired up later.
  }

  /** Disconnect from the companion app. */
  disconnect(): void {
    this._status = 'disconnected';
    this._version = null;
    this.emit('statusChange', 'disconnected');
  }

  /** Request a plugin scan from the companion app. */
  async scanPlugins(): Promise<void> {
    // Stub — sends scan request over WebSocket
  }

  /** Create a plugin instance in the companion app. */
  async createInstance(pluginUid: string, instanceId: string): Promise<void> {
    // Stub — sends create request
    void pluginUid;
    void instanceId;
  }

  /** Destroy a plugin instance in the companion app. */
  async destroyInstance(instanceId: string): Promise<void> {
    // Stub — sends destroy request
    void instanceId;
  }

  /** Set a parameter value on a plugin instance. */
  async setParam(instanceId: string, paramId: number, value: number): Promise<void> {
    // Stub — sends param change
    void instanceId;
    void paramId;
    void value;
  }

  // ─── Event Emitter ──────────────────────────────────────────────────────

  on<E extends EventName>(event: E, listener: EventMap[E]): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as EventMap[EventName]);
  }

  off<E extends EventName>(event: E, listener: EventMap[E]): void {
    this.listeners.get(event)?.delete(listener as EventMap[EventName]);
  }

  private emit<E extends EventName>(event: E, ...args: Parameters<EventMap[E]>): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      (fn as (...a: Parameters<EventMap[E]>) => void)(...args);
    }
  }

  /** @internal — For testing: simulate a successful connection. */
  _simulateConnected(version = '1.0.0'): void {
    this._status = 'connected';
    this._version = version;
    this.emit('statusChange', 'connected');
  }

  /** @internal — For testing: simulate a disconnection. */
  _simulateDisconnected(): void {
    this._status = 'disconnected';
    this._version = null;
    this.emit('statusChange', 'disconnected');
  }

  /** @internal — For testing: simulate an error. */
  _simulateError(message: string): void {
    this._status = 'error';
    this.emit('statusChange', 'error');
    this.emit('error', message);
  }
}
