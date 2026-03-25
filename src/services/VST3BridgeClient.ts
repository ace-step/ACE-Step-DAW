/**
 * VST3BridgeClient — WebSocket client for the VST3 companion app.
 *
 * Connects to the local companion via WebSocket, handles the protocol
 * handshake, plugin scanning, and forwards events to listeners.
 */
import type { VST3ConnectionStatus, VST3PluginInfo, VST3Parameter } from '../types/vst3';

const DEFAULT_URL = 'ws://127.0.0.1:9851';
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];

type EventMap = {
  statusChange: (status: VST3ConnectionStatus) => void;
  error: (error: string) => void;
  scanComplete: (plugins: VST3PluginInfo[]) => void;
  scanProgress: (found: number, current: string) => void;
  instanceCreated: (instanceId: string, params: VST3Parameter[]) => void;
  instanceDestroyed: (instanceId: string) => void;
  paramChanged: (instanceId: string, paramId: number, value: number) => void;
};

type EventName = keyof EventMap;

export class VST3BridgeClient {
  private _status: VST3ConnectionStatus = 'disconnected';
  private _version: string | null = null;
  private listeners = new Map<EventName, Set<EventMap[EventName]>>();
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;
  private url = DEFAULT_URL;

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
  async connect(url?: string): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return; // already connected or connecting
    }

    this.url = url || DEFAULT_URL;
    this.shouldReconnect = true;
    this.reconnectAttempt = 0;
    this._openWebSocket();
  }

  /** Disconnect from the companion app. */
  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._setStatus('disconnected');
    this._version = null;
  }

  /** Request a plugin scan from the companion app. */
  async scanPlugins(): Promise<void> {
    this._send({ type: 'scanPlugins' });
  }

  /** Create a plugin instance in the companion app. */
  async createInstance(pluginUid: string, instanceId: string): Promise<void> {
    this._send({
      type: 'instantiate',
      req_id: instanceId,
      plugin_uid: pluginUid,
      instance_id: instanceId,
    });
  }

  /** Destroy a plugin instance in the companion app. */
  async destroyInstance(instanceId: string): Promise<void> {
    this._send({ type: 'destroy', instance_id: instanceId });
  }

  /** Set a parameter value on a plugin instance. */
  async setParam(instanceId: string, paramId: number, value: number): Promise<void> {
    this._send({
      type: 'setParam',
      instance_id: instanceId,
      param_id: paramId,
      value,
    });
  }

  // ─── Private: WebSocket ────────────────────────────────────────────────

  private _openWebSocket(): void {
    this._setStatus('connecting');

    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this._handleConnectionFailure('Failed to create WebSocket');
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      // Send hello handshake
      this._send({
        type: 'hello',
        version: '1.0',
        sample_rate: 48000,
        block_size: 128,
      });
    };

    this.ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        this._handleMessage(event.data);
      }
      // Binary frames (audio) handled separately in future
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (this._status === 'connected') {
        this._setStatus('disconnected');
        this._version = null;
      }
      if (this.shouldReconnect) {
        this._scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onerror is always followed by onclose, so just mark the failure
      if (this._status === 'connecting') {
        this._handleConnectionFailure('Connection refused');
      }
    };
  }

  private _handleMessage(raw: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'helloAck':
        this._version = (msg.version as string) || '0.0.0';
        this._setStatus('connected');
        break;

      case 'scanProgress':
        this.emit('scanProgress', msg.found as number, msg.current as string);
        break;

      case 'scanComplete': {
        const plugins = (msg.plugins as VST3PluginInfo[]) || [];
        this.emit('scanComplete', plugins);
        break;
      }

      case 'instantiated':
        this.emit('instanceCreated', msg.instance_id as string, (msg.parameters as VST3Parameter[]) || []);
        break;

      case 'paramChanged':
        this.emit('paramChanged', msg.instance_id as string, msg.param_id as number, msg.value as number);
        break;

      case 'error':
        this.emit('error', (msg.message as string) || 'Unknown error');
        break;
    }
  }

  private _handleConnectionFailure(reason: string): void {
    if (this.shouldReconnect) {
      this._scheduleReconnect();
    } else {
      this._setStatus('disconnected');
      this.emit('error', reason);
    }
  }

  private _scheduleReconnect(): void {
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) {
        this._openWebSocket();
      }
    }, delay);
  }

  private _send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private _setStatus(newStatus: VST3ConnectionStatus): void {
    if (this._status !== newStatus) {
      this._status = newStatus;
      this.emit('statusChange', newStatus);
    }
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
