/**
 * Mock VST3 Companion WebSocket Server for E2E testing.
 *
 * Speaks the VST3 bridge protocol, returning fake scan results,
 * echo-processing audio, and tracking parameter/MIDI interactions.
 */
import { WebSocketServer, WebSocket } from 'ws';

export interface MockPluginInfo {
  uid: string;
  name: string;
  vendor: string;
  category: 'instrument' | 'effect';
  subcategory: string;
  inputChannels: number;
  outputChannels: number;
  hasEditor: boolean;
  supportsMultiOutput: boolean;
  outputBusses: { name: string; channels: number }[];
}

const MOCK_PLUGINS: MockPluginInfo[] = [
  {
    uid: 'mock-reverb-001',
    name: 'Mock Reverb',
    vendor: 'Test Audio',
    category: 'effect',
    subcategory: 'Reverb',
    inputChannels: 2,
    outputChannels: 2,
    hasEditor: true,
    supportsMultiOutput: false,
    outputBusses: [{ name: 'Main', channels: 2 }],
  },
  {
    uid: 'mock-synth-001',
    name: 'Mock Synth',
    vendor: 'Test Audio',
    category: 'instrument',
    subcategory: 'Synth',
    inputChannels: 0,
    outputChannels: 2,
    hasEditor: true,
    supportsMultiOutput: false,
    outputBusses: [{ name: 'Main', channels: 2 }],
  },
  {
    uid: 'mock-eq-001',
    name: 'Mock EQ',
    vendor: 'Pro Audio Labs',
    category: 'effect',
    subcategory: 'EQ',
    inputChannels: 2,
    outputChannels: 2,
    hasEditor: false,
    supportsMultiOutput: false,
    outputBusses: [{ name: 'Main', channels: 2 }],
  },
];

const MOCK_PARAMS = [
  { id: 0, name: 'Mix', min: 0, max: 1, default: 0.5, stepCount: 0, unitName: '%' },
  { id: 1, name: 'Size', min: 0, max: 1, default: 0.7, stepCount: 0, unitName: '' },
  { id: 2, name: 'Decay', min: 0, max: 10, default: 2.5, stepCount: 0, unitName: 's' },
];

export interface MockCompanionEvents {
  paramChanges: { instanceId: string; paramId: number; value: number }[];
  midiEvents: { instanceId: string; events: unknown[] }[];
  instantiated: string[];
  destroyed: string[];
}

export class MockCompanionServer {
  private wss: WebSocketServer | null = null;
  private client: WebSocket | null = null;
  readonly events: MockCompanionEvents = {
    paramChanges: [],
    midiEvents: [],
    instantiated: [],
    destroyed: [],
  };

  async start(port: number = 9851): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port });
      this.wss.on('connection', (ws) => {
        this.client = ws;
        ws.on('message', (data) => this.handleMessage(ws, data));
      });
      this.wss.on('listening', () => resolve());
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.client) {
        this.client.close();
        this.client = null;
      }
      if (this.wss) {
        this.wss.close(() => resolve());
        this.wss = null;
      } else {
        resolve();
      }
    });
  }

  resetEvents(): void {
    this.events.paramChanges = [];
    this.events.midiEvents = [];
    this.events.instantiated = [];
    this.events.destroyed = [];
  }

  /** Send a param_changed message to the browser (simulates native GUI tweak). */
  sendParamChanged(instanceId: string, paramId: number, value: number): void {
    this.send({ type: 'param_changed', instanceId, paramId, value });
  }

  private send(msg: object): void {
    if (this.client?.readyState === WebSocket.OPEN) {
      this.client.send(JSON.stringify(msg));
    }
  }

  private handleMessage(ws: WebSocket, raw: unknown): void {
    const text = typeof raw === 'string' ? raw : raw.toString();
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(text);
    } catch {
      return; // binary frame or invalid JSON — ignore
    }

    switch (msg.type) {
      case 'hello':
        ws.send(JSON.stringify({
          type: 'hello_ack',
          version: '1.0',
          capabilities: ['vst3'],
        }));
        break;

      case 'scan_plugins':
        // Send progress updates
        for (let i = 0; i < MOCK_PLUGINS.length; i++) {
          ws.send(JSON.stringify({
            type: 'scan_progress',
            found: i + 1,
            current: MOCK_PLUGINS[i].name,
          }));
        }
        ws.send(JSON.stringify({
          type: 'scan_complete',
          plugins: MOCK_PLUGINS,
        }));
        break;

      case 'instantiate': {
        const instanceId = msg.instanceId as string;
        this.events.instantiated.push(instanceId);
        ws.send(JSON.stringify({
          type: 'instantiated',
          reqId: msg.reqId,
          instanceId,
          parameters: MOCK_PARAMS,
          latencySamples: 128,
          tailSamples: 0,
          presets: [
            { id: 0, name: 'Default' },
            { id: 1, name: 'Large Hall' },
            { id: 2, name: 'Small Room' },
          ],
        }));
        break;
      }

      case 'set_param':
        this.events.paramChanges.push({
          instanceId: msg.instanceId as string,
          paramId: msg.paramId as number,
          value: msg.value as number,
        });
        break;

      case 'midi':
        this.events.midiEvents.push({
          instanceId: msg.instanceId as string,
          events: msg.events as unknown[],
        });
        break;

      case 'open_editor':
        ws.send(JSON.stringify({
          type: 'editor_opened',
          instanceId: msg.instanceId,
          width: 800,
          height: 600,
        }));
        break;

      case 'close_editor':
        ws.send(JSON.stringify({
          type: 'editor_closed',
          instanceId: msg.instanceId,
        }));
        break;

      case 'get_state':
        ws.send(JSON.stringify({
          type: 'state_data',
          instanceId: msg.instanceId,
          data: btoa('mock-vst3-state-data'),
        }));
        break;

      case 'set_state':
        // Acknowledge silently
        break;

      case 'load_preset':
        // Acknowledge silently
        break;

      case 'destroy':
        this.events.destroyed.push(msg.instanceId as string);
        break;

      case 'get_latency':
        ws.send(JSON.stringify({
          type: 'latency_info',
          instanceId: msg.instanceId,
          samples: 128,
        }));
        break;

      case 'set_processing':
        // Acknowledge silently
        break;
    }
  }
}

export { MOCK_PLUGINS, MOCK_PARAMS };
