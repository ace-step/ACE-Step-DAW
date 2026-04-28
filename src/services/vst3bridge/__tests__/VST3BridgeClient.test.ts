import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VST3BridgeClient } from '../VST3BridgeClient';
import {
  VST3_BRIDGE_VERSION,
  encodeAudioFrame,
  decodeAudioFrame,
  fnv1aHash,
  type VST3PluginInfo,
  type ErrorMessage,
  type HelloAckMessage,
  type ScanCompleteMessage,
  type InstantiatedMessage,
  type EditorOpenedMessage,
  type StateDataMessage,
  type ParamChangedMessage,
  type ScanProgressMessage,
} from '../VST3BridgeProtocol';

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  binaryType: string = 'arraybuffer';

  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  });

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) this.onopen(new Event('open'));
  }

  simulateMessage(data: object) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }

  simulateBinaryMessage(data: ArrayBuffer) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }));
    }
  }

  simulateClose(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close', { code, reason }));
    }
  }

  simulateError() {
    if (this.onerror) this.onerror(new Event('error'));
  }

  static instances: MockWebSocket[] = [];
  static reset() {
    MockWebSocket.instances = [];
  }
  static get latest(): MockWebSocket {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Flush microtasks so async continuations run. */
async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}

/** Complete the hello handshake and flush microtasks. */
async function completeHandshake(ws: MockWebSocket) {
  ws.simulateOpen();
  // The client sends hello via send() (no reqId), then listens for helloAck.
  ws.simulateMessage({
    type: 'helloAck',
    version: VST3_BRIDGE_VERSION,
    capabilities: ['scan', 'host', 'midi', 'state'],
  } satisfies HelloAckMessage);
  await flush();
}

function makeSamplePluginInfo(): VST3PluginInfo {
  return {
    uid: 'com.vendor.synth',
    name: 'Test Synth',
    vendor: 'Vendor',
    version: '1.0',
    category: 'Instrument',
    inputChannels: 0,
    outputChannels: 2,
    hasEditor: true,
    parameters: [
      {
        id: 0,
        name: 'Volume',
        units: 'dB',
        defaultValue: 0.8,
        minValue: 0,
        maxValue: 1,
        stepCount: 0,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VST3BridgeClient', () => {
  let client: VST3BridgeClient;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.reset();
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    client?.dispose();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // -----------------------------------------------------------------------
  // Connection state transitions
  // -----------------------------------------------------------------------

  describe('connection state transitions', () => {
    it('starts as disconnected', () => {
      client = new VST3BridgeClient();
      expect(client.connectionState).toBe('disconnected');
      expect(client.isConnected).toBe(false);
    });

    it('transitions to connecting on connect()', () => {
      client = new VST3BridgeClient();
      client.connect();
      expect(client.connectionState).toBe('connecting');
      expect(client.isConnected).toBe(false);
    });

    it('transitions to connected after handshake', async () => {
      client = new VST3BridgeClient();
      client.connect();
      const ws = MockWebSocket.latest;
      await completeHandshake(ws);
      expect(client.connectionState).toBe('connected');
      expect(client.isConnected).toBe(true);
    });

    it('transitions back to disconnected on disconnect()', async () => {
      client = new VST3BridgeClient();
      client.connect();
      const ws = MockWebSocket.latest;
      await completeHandshake(ws);
      client.disconnect();
      expect(client.connectionState).toBe('disconnected');
      expect(client.isConnected).toBe(false);
    });

    it('dispatches connectionchange events', async () => {
      client = new VST3BridgeClient();
      const handler = vi.fn();
      client.addEventListener('connectionchange', handler);

      client.connect();
      expect(handler).toHaveBeenCalledTimes(1); // -> connecting

      const ws = MockWebSocket.latest;
      await completeHandshake(ws);
      expect(handler).toHaveBeenCalledTimes(2); // -> connected

      client.disconnect();
      expect(handler).toHaveBeenCalledTimes(3); // -> disconnected
    });
  });

  // -----------------------------------------------------------------------
  // Request/response correlation
  // -----------------------------------------------------------------------

  describe('request/response correlation', () => {
    it('resolves when a matching reqId response arrives', async () => {
      client = new VST3BridgeClient();
      client.connect();
      const ws = MockWebSocket.latest;
      await completeHandshake(ws);

      const promise = client.request<ScanCompleteMessage>({ type: 'scanPlugins' });

      const lastCall = ws.send.mock.calls[ws.send.mock.calls.length - 1][0];
      const sent = JSON.parse(lastCall as string);
      expect(sent.type).toBe('scanPlugins');
      expect(typeof sent.reqId).toBe('string');

      const plugins = [makeSamplePluginInfo()];
      ws.simulateMessage({
        type: 'scanComplete',
        reqId: sent.reqId,
        plugins,
      } satisfies ScanCompleteMessage);

      const result = await promise;
      expect(result.type).toBe('scanComplete');
      expect(result.plugins).toEqual(plugins);
    });

    it('rejects when an error response with matching reqId arrives', async () => {
      client = new VST3BridgeClient();
      client.connect();
      const ws = MockWebSocket.latest;
      await completeHandshake(ws);

      const promise = client.request({ type: 'scanPlugins' });

      const lastCall = ws.send.mock.calls[ws.send.mock.calls.length - 1][0];
      const sent = JSON.parse(lastCall as string);

      ws.simulateMessage({
        type: 'error',
        reqId: sent.reqId,
        code: 'SCAN_FAILED',
        message: 'No plugins directory found',
      } satisfies ErrorMessage);

      await expect(promise).rejects.toThrow('No plugins directory found');
    });

    it('rejects on timeout when no response arrives', async () => {
      client = new VST3BridgeClient();
      client.connect();
      const ws = MockWebSocket.latest;
      await completeHandshake(ws);

      const promise = client.request({ type: 'scanPlugins' }, 500);

      vi.advanceTimersByTime(501);

      await expect(promise).rejects.toThrow(/timed out/i);
    });
  });

  // -----------------------------------------------------------------------
  // Auto-reconnect with exponential backoff
  // -----------------------------------------------------------------------

  describe('auto-reconnect backoff', () => {
    it('reconnects after connection drops', async () => {
      client = new VST3BridgeClient();
      client.connect();
      const ws1 = MockWebSocket.latest;
      await completeHandshake(ws1);

      ws1.simulateClose(1006, 'abnormal');

      expect(MockWebSocket.instances).toHaveLength(1);

      vi.advanceTimersByTime(1000);
      expect(MockWebSocket.instances).toHaveLength(2);
    });

    it('uses exponential backoff: 1s, 2s, 4s, 8s, capped at 30s', () => {
      client = new VST3BridgeClient();
      client.connect();

      MockWebSocket.latest.simulateError();
      MockWebSocket.latest.simulateClose(1006);

      // Backoff 1: 1s
      vi.advanceTimersByTime(999);
      expect(MockWebSocket.instances).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(2);

      MockWebSocket.latest.simulateError();
      MockWebSocket.latest.simulateClose(1006);

      // Backoff 2: 2s
      vi.advanceTimersByTime(1999);
      expect(MockWebSocket.instances).toHaveLength(2);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(3);

      MockWebSocket.latest.simulateError();
      MockWebSocket.latest.simulateClose(1006);

      // Backoff 3: 4s
      vi.advanceTimersByTime(3999);
      expect(MockWebSocket.instances).toHaveLength(3);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(4);
    });

    it('resets backoff after successful connection', async () => {
      client = new VST3BridgeClient();
      client.connect();

      MockWebSocket.latest.simulateError();
      MockWebSocket.latest.simulateClose(1006);

      vi.advanceTimersByTime(1000);
      expect(MockWebSocket.instances).toHaveLength(2);

      // Succeed this time
      await completeHandshake(MockWebSocket.latest);

      // Disconnect again
      MockWebSocket.latest.simulateClose(1006);

      // Should be back to 1s backoff (not 2s)
      vi.advanceTimersByTime(999);
      expect(MockWebSocket.instances).toHaveLength(2);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(3);
    });

    it('does not reconnect after explicit disconnect()', async () => {
      client = new VST3BridgeClient();
      client.connect();
      const ws = MockWebSocket.latest;
      await completeHandshake(ws);

      client.disconnect();

      vi.advanceTimersByTime(60000);
      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // Binary audio frames
  // -----------------------------------------------------------------------

  describe('binary audio frame send/receive', () => {
    it('sends a correctly encoded audio frame', async () => {
      client = new VST3BridgeClient();
      client.connect();
      const ws = MockWebSocket.latest;
      await completeHandshake(ws);

      const hash = fnv1aHash('instance-1');
      const ch0 = new Float32Array([1.0, 0.5, -0.5]);
      const ch1 = new Float32Array([0.0, 0.25, -0.25]);

      client.sendAudioFrame(hash, 42, 2, [ch0, ch1]);

      expect(ws.send).toHaveBeenCalled();
      const sentBuf = ws.send.mock.calls[ws.send.mock.calls.length - 1][0] as ArrayBuffer;
      expect(sentBuf).toBeInstanceOf(ArrayBuffer);

      const decoded = decodeAudioFrame(sentBuf);
      expect(decoded.instanceIdHash).toBe(hash);
      expect(decoded.seq).toBe(42);
      expect(decoded.channels).toBe(2);
      expect(decoded.samples[0]).toEqual(ch0);
      expect(decoded.samples[1]).toEqual(ch1);
    });

    it('receives binary audio frames and invokes handler', async () => {
      client = new VST3BridgeClient();
      client.connect();
      const ws = MockWebSocket.latest;
      await completeHandshake(ws);

      const handler = vi.fn();
      client.onAudioFrame(handler);

      const hash = fnv1aHash('instance-2');
      const ch0 = new Float32Array([0.1, 0.2]);
      const frame = encodeAudioFrame(hash, 7, 1, [ch0]);

      ws.simulateBinaryMessage(frame);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        hash,
        7,
        1,
        expect.arrayContaining([expect.any(Float32Array)]),
      );
    });

    it('unsubscribes audio frame handler on cleanup call', async () => {
      client = new VST3BridgeClient();
      client.connect();
      const ws = MockWebSocket.latest;
      await completeHandshake(ws);

      const handler = vi.fn();
      const unsub = client.onAudioFrame(handler);
      unsub();

      const frame = encodeAudioFrame(1, 1, 1, [new Float32Array([0])]);
      ws.simulateBinaryMessage(frame);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Error message rejection of pending requests
  // -----------------------------------------------------------------------

  describe('error message rejection', () => {
    it('rejects the correct pending request on error', async () => {
      client = new VST3BridgeClient();
      client.connect();
      const ws = MockWebSocket.latest;
      await completeHandshake(ws);

      const promise1 = client.request({ type: 'getState', instanceId: 'a' });
      const call1 = ws.send.mock.calls[ws.send.mock.calls.length - 1][0];
      const req1 = JSON.parse(call1 as string);

      const promise2 = client.request({ type: 'getState', instanceId: 'b' });
      const call2 = ws.send.mock.calls[ws.send.mock.calls.length - 1][0];
      const req2 = JSON.parse(call2 as string);

      ws.simulateMessage({
        type: 'error',
        reqId: req1.reqId,
        code: 'NOT_FOUND',
        message: 'Instance not found',
      });

      await expect(promise1).rejects.toThrow('Instance not found');

      ws.simulateMessage({
        type: 'stateData',
        reqId: req2.reqId,
        instanceId: 'b',
        data: 'base64data',
      } satisfies StateDataMessage);

      const result = await promise2;
      expect(result).toEqual(
        expect.objectContaining({ type: 'stateData', data: 'base64data' }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // High-level convenience methods
  // -----------------------------------------------------------------------

  describe('convenience methods', () => {
    it('scanPlugins returns plugin list', async () => {
      client = new VST3BridgeClient();
      client.connect();
      const ws = MockWebSocket.latest;
      await completeHandshake(ws);

      const promise = client.scanPlugins();

      const lastCall = ws.send.mock.calls[ws.send.mock.calls.length - 1][0];
      const sent = JSON.parse(lastCall as string);
      expect(sent.type).toBe('scanPlugins');

      const plugins = [makeSamplePluginInfo()];
      ws.simulateMessage({
        type: 'scanComplete',
        reqId: sent.reqId,
        plugins,
      });

      await expect(promise).resolves.toEqual(plugins);
    });

    it('instantiate returns instance info', async () => {
      client = new VST3BridgeClient();
      client.connect();
      const ws = MockWebSocket.latest;
      await completeHandshake(ws);

      const promise = client.instantiate('com.vendor.synth', 'inst-1');

      const lastCall = ws.send.mock.calls[ws.send.mock.calls.length - 1][0];
      const sent = JSON.parse(lastCall as string);
      expect(sent.type).toBe('instantiate');
      expect(sent.pluginUid).toBe('com.vendor.synth');
      expect(sent.instanceId).toBe('inst-1');

      ws.simulateMessage({
        type: 'instantiated',
        reqId: sent.reqId,
        instanceId: 'inst-1',
        pluginInfo: makeSamplePluginInfo(),
      } satisfies InstantiatedMessage);

      const result = await promise;
      expect(result.instanceId).toBe('inst-1');
    });

    it('openEditor returns dimensions', async () => {
      client = new VST3BridgeClient();
      client.connect();
      const ws = MockWebSocket.latest;
      await completeHandshake(ws);

      const promise = client.openEditor('inst-1');

      const lastCall = ws.send.mock.calls[ws.send.mock.calls.length - 1][0];
      const sent = JSON.parse(lastCall as string);

      ws.simulateMessage({
        type: 'editorOpened',
        reqId: sent.reqId,
        instanceId: 'inst-1',
        width: 800,
        height: 600,
      } satisfies EditorOpenedMessage);

      const result = await promise;
      expect(result).toEqual({ width: 800, height: 600 });
    });

    it('getState returns base64 string', async () => {
      client = new VST3BridgeClient();
      client.connect();
      const ws = MockWebSocket.latest;
      await completeHandshake(ws);

      const promise = client.getState('inst-1');

      const lastCall = ws.send.mock.calls[ws.send.mock.calls.length - 1][0];
      const sent = JSON.parse(lastCall as string);

      ws.simulateMessage({
        type: 'stateData',
        reqId: sent.reqId,
        instanceId: 'inst-1',
        data: 'AQID',
      } satisfies StateDataMessage);

      await expect(promise).resolves.toBe('AQID');
    });

    it('setParam sends fire-and-forget message', async () => {
      client = new VST3BridgeClient();
      client.connect();
      const ws = MockWebSocket.latest;
      await completeHandshake(ws);

      client.setParam('inst-1', 0, 0.75);

      const lastCall = ws.send.mock.calls[ws.send.mock.calls.length - 1][0];
      const sent = JSON.parse(lastCall as string);
      expect(sent.type).toBe('setParam');
      expect(sent.instanceId).toBe('inst-1');
      expect(sent.paramId).toBe(0);
      expect(sent.value).toBe(0.75);
    });

    it('sendMidi sends fire-and-forget message', async () => {
      client = new VST3BridgeClient();
      client.connect();
      const ws = MockWebSocket.latest;
      await completeHandshake(ws);

      client.sendMidi('inst-1', [{ status: 0x90, data1: 60, data2: 100 }]);

      const lastCall = ws.send.mock.calls[ws.send.mock.calls.length - 1][0];
      const sent = JSON.parse(lastCall as string);
      expect(sent.type).toBe('midi');
      expect(sent.events).toHaveLength(1);
    });

    it('destroy sends fire-and-forget message', async () => {
      client = new VST3BridgeClient();
      client.connect();
      const ws = MockWebSocket.latest;
      await completeHandshake(ws);

      client.destroy('inst-1');

      const lastCall = ws.send.mock.calls[ws.send.mock.calls.length - 1][0];
      const sent = JSON.parse(lastCall as string);
      expect(sent.type).toBe('destroy');
      expect(sent.instanceId).toBe('inst-1');
    });
  });

  // -----------------------------------------------------------------------
  // Message event handlers (on)
  // -----------------------------------------------------------------------

  describe('on() message handlers', () => {
    it('invokes handler for matching message type', async () => {
      client = new VST3BridgeClient();
      client.connect();
      const ws = MockWebSocket.latest;
      await completeHandshake(ws);

      const handler = vi.fn();
      client.on('paramChanged', handler);

      ws.simulateMessage({
        type: 'paramChanged',
        instanceId: 'inst-1',
        paramId: 0,
        value: 0.5,
      } satisfies ParamChangedMessage);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'paramChanged', value: 0.5 }),
      );
    });

    it('returns an unsubscribe function', async () => {
      client = new VST3BridgeClient();
      client.connect();
      const ws = MockWebSocket.latest;
      await completeHandshake(ws);

      const handler = vi.fn();
      const unsub = client.on('paramChanged', handler);
      unsub();

      ws.simulateMessage({
        type: 'paramChanged',
        instanceId: 'inst-1',
        paramId: 0,
        value: 0.5,
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('dispatches scanprogress custom events', async () => {
      client = new VST3BridgeClient();
      client.connect();
      const ws = MockWebSocket.latest;
      await completeHandshake(ws);

      const handler = vi.fn();
      client.addEventListener('scanprogress', handler);

      ws.simulateMessage({
        type: 'scanProgress',
        current: 3,
        total: 10,
        pluginName: 'TestPlug',
      } satisfies ScanProgressMessage);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('dispatches paramchanged custom events', async () => {
      client = new VST3BridgeClient();
      client.connect();
      const ws = MockWebSocket.latest;
      await completeHandshake(ws);

      const handler = vi.fn();
      client.addEventListener('paramchanged', handler);

      ws.simulateMessage({
        type: 'paramChanged',
        instanceId: 'inst-1',
        paramId: 0,
        value: 0.5,
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});
