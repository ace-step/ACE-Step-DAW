/**
 * Tests for VST3 Bridge Protocol types, type guards, and helpers.
 */
import { describe, it, expect } from 'vitest';
import {
  fnv1aHash,
  encodeAudioFrame,
  decodeAudioFrame,
  isVST3BridgeMessage,
  VST3_BRIDGE_PORT,
  VST3_BRIDGE_VERSION,
  AUDIO_HEADER_SIZE,
  type VST3BridgeMessage,
  type HelloMessage,
  type HelloAckMessage,
  type ScanPluginsMessage,
  type ScanProgressMessage,
  type ScanCompleteMessage,
  type InstantiateMessage,
  type InstantiatedMessage,
  type SetParamMessage,
  type ParamChangedMessage,
  type MidiMessage,
  type OpenEditorMessage,
  type EditorOpenedMessage,
  type CloseEditorMessage,
  type EditorClosedMessage,
  type GetStateMessage,
  type StateDataMessage,
  type SetStateMessage,
  type LoadPresetMessage,
  type DestroyMessage,
  type SetProcessingMessage,
  type GetLatencyMessage,
  type LatencyInfoMessage,
  type RouteSidechainMessage,
  type ErrorMessage,
  type VST3PluginInfo,
  type VST3ParamInfo,
  type VST3PresetInfo,
  type VST3MidiEvent,
} from '../VST3BridgeProtocol';

// ─── Constants ──────────────────────────────────────────────────────────────

describe('VST3 Bridge Protocol constants', () => {
  it('exports expected port', () => {
    expect(VST3_BRIDGE_PORT).toBe(9851);
  });

  it('exports expected version', () => {
    expect(VST3_BRIDGE_VERSION).toBe('1.0');
  });

  it('exports expected audio header size', () => {
    expect(AUDIO_HEADER_SIZE).toBe(16);
  });
});

// ─── fnv1aHash ──────────────────────────────────────────────────────────────

describe('fnv1aHash', () => {
  it('produces consistent results for the same input', () => {
    const hash1 = fnv1aHash('test-instance-id');
    const hash2 = fnv1aHash('test-instance-id');
    expect(hash1).toBe(hash2);
  });

  it('produces different results for different inputs', () => {
    const hash1 = fnv1aHash('instance-a');
    const hash2 = fnv1aHash('instance-b');
    expect(hash1).not.toBe(hash2);
  });

  it('returns a 32-bit unsigned integer', () => {
    const hash = fnv1aHash('some-string');
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(hash)).toBe(true);
  });

  it('handles empty string', () => {
    const hash = fnv1aHash('');
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
  });
});

// ─── Audio Frame Encoding / Decoding ────────────────────────────────────────

describe('encodeAudioFrame / decodeAudioFrame', () => {
  it('round-trips a mono frame', () => {
    const samples = [new Float32Array([0.1, 0.2, 0.3, 0.4])];
    const buffer = encodeAudioFrame(42, 1, 1, samples);
    const result = decodeAudioFrame(buffer);

    expect(result.instanceIdHash).toBe(42);
    expect(result.seq).toBe(1);
    expect(result.channels).toBe(1);
    expect(result.samples).toHaveLength(1);
    expect(result.samples[0].length).toBe(4);
    expect(result.samples[0][0]).toBeCloseTo(0.1, 5);
    expect(result.samples[0][3]).toBeCloseTo(0.4, 5);
  });

  it('round-trips a stereo frame', () => {
    const left = new Float32Array([1.0, -1.0, 0.5, -0.5]);
    const right = new Float32Array([0.0, 0.25, -0.25, 0.75]);
    const buffer = encodeAudioFrame(100, 7, 2, [left, right]);
    const result = decodeAudioFrame(buffer);

    expect(result.instanceIdHash).toBe(100);
    expect(result.seq).toBe(7);
    expect(result.channels).toBe(2);
    expect(result.samples).toHaveLength(2);
    expect(result.samples[0][0]).toBeCloseTo(1.0, 5);
    expect(result.samples[0][1]).toBeCloseTo(-1.0, 5);
    expect(result.samples[1][0]).toBeCloseTo(0.0, 5);
    expect(result.samples[1][3]).toBeCloseTo(0.75, 5);
  });

  it('produces a buffer of expected size', () => {
    const samples = [new Float32Array(128), new Float32Array(128)];
    const buffer = encodeAudioFrame(1, 0, 2, samples);
    // 16 byte header + 2 channels * 128 samples * 4 bytes
    expect(buffer.byteLength).toBe(16 + 2 * 128 * 4);
  });
});

// ─── Type Guards ────────────────────────────────────────────────────────────

describe('isVST3BridgeMessage', () => {
  it('returns true for a valid hello message', () => {
    const msg: HelloMessage = {
      type: 'hello',
      version: '1.0',
      sampleRate: 44100,
      blockSize: 512,
    };
    expect(isVST3BridgeMessage(msg)).toBe(true);
  });

  it('returns true for a valid hello_ack message', () => {
    const msg: HelloAckMessage = {
      type: 'hello_ack',
      version: '1.0',
      capabilities: ['scan', 'process'],
    };
    expect(isVST3BridgeMessage(msg)).toBe(true);
  });

  it('returns true for a valid scan_plugins message', () => {
    const msg: ScanPluginsMessage = { type: 'scan_plugins' };
    expect(isVST3BridgeMessage(msg)).toBe(true);
  });

  it('returns true for a valid scan_progress message', () => {
    const msg: ScanProgressMessage = {
      type: 'scan_progress',
      found: 5,
      current: 'Serum.vst3',
    };
    expect(isVST3BridgeMessage(msg)).toBe(true);
  });

  it('returns true for a valid instantiate message', () => {
    const msg: InstantiateMessage = {
      type: 'instantiate',
      reqId: 'req-1',
      pluginUid: 'uid-abc',
      instanceId: 'inst-1',
    };
    expect(isVST3BridgeMessage(msg)).toBe(true);
  });

  it('returns true for a valid error message', () => {
    const msg: ErrorMessage = {
      type: 'error',
      code: 'PLUGIN_NOT_FOUND',
      message: 'Plugin not found',
    };
    expect(isVST3BridgeMessage(msg)).toBe(true);
  });

  it('returns true for a valid midi message', () => {
    const msg: MidiMessage = {
      type: 'midi',
      instanceId: 'inst-1',
      events: [{ type: 'noteOn', note: 60, velocity: 100, sampleOffset: 0 }],
    };
    expect(isVST3BridgeMessage(msg)).toBe(true);
  });

  it('returns true for set_param message', () => {
    const msg: SetParamMessage = {
      type: 'set_param',
      instanceId: 'inst-1',
      paramId: 0,
      value: 0.5,
    };
    expect(isVST3BridgeMessage(msg)).toBe(true);
  });

  it('returns true for destroy message', () => {
    const msg: DestroyMessage = { type: 'destroy', instanceId: 'inst-1' };
    expect(isVST3BridgeMessage(msg)).toBe(true);
  });

  it('returns true for set_processing message', () => {
    const msg: SetProcessingMessage = {
      type: 'set_processing',
      instanceId: 'inst-1',
      active: true,
    };
    expect(isVST3BridgeMessage(msg)).toBe(true);
  });

  it('returns true for route_sidechain message', () => {
    const msg: RouteSidechainMessage = {
      type: 'route_sidechain',
      instanceId: 'inst-1',
      sidechainInputBus: 1,
      sourceInstanceId: 'inst-2',
    };
    expect(isVST3BridgeMessage(msg)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isVST3BridgeMessage(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isVST3BridgeMessage(undefined)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isVST3BridgeMessage('hello')).toBe(false);
  });

  it('returns false for an object without type', () => {
    expect(isVST3BridgeMessage({ version: '1.0' })).toBe(false);
  });

  it('returns false for an object with unknown type', () => {
    expect(isVST3BridgeMessage({ type: 'unknown_message' })).toBe(false);
  });
});
