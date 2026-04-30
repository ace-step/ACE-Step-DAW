/**
 * Tests for VST3 effects integration in useEffectsSync.
 *
 * Verifies that VST3 effect plugins on any track type
 * get wired into the audio graph via spliceEffects.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pluginEngine } from '../../engine/PluginEngine';
import { effectsEngine } from '../../engine/EffectsEngine';
import {
  buildCombinedEffectsChain,
  calculatePluginDelayCompensation,
  calculatePluginDelayCompensationForTracks,
} from '../useEffectsSync';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAudioNode(label = 'node'): AudioNode {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    _label: label,
  } as unknown as AudioNode;
}

describe('buildCombinedEffectsChain', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null/null when no effects or plugins exist', () => {
    vi.spyOn(pluginEngine, 'getInputNode').mockReturnValue(null);
    vi.spyOn(pluginEngine, 'getOutputNode').mockReturnValue(null);
    vi.spyOn(effectsEngine, 'getInputNode').mockReturnValue(null);
    vi.spyOn(effectsEngine, 'getOutputNode').mockReturnValue(null);

    const result = buildCombinedEffectsChain('track-1');
    expect(result.input).toBeNull();
    expect(result.output).toBeNull();
  });

  it('returns only built-in effects when no VST3 plugins exist', () => {
    const effectsInput = makeAudioNode('effects-in');
    const effectsOutput = makeAudioNode('effects-out');

    vi.spyOn(pluginEngine, 'getInputNode').mockReturnValue(null);
    vi.spyOn(pluginEngine, 'getOutputNode').mockReturnValue(null);
    vi.spyOn(effectsEngine, 'getInputNode').mockReturnValue(effectsInput);
    vi.spyOn(effectsEngine, 'getOutputNode').mockReturnValue(effectsOutput);

    const result = buildCombinedEffectsChain('track-1');
    expect(result.input).toBe(effectsInput);
    expect(result.output).toBe(effectsOutput);
  });

  it('returns only VST3 plugins when no built-in effects exist', () => {
    const pluginInput = makeAudioNode('plugin-in');
    const pluginOutput = makeAudioNode('plugin-out');

    vi.spyOn(pluginEngine, 'getInputNode').mockReturnValue(pluginInput);
    vi.spyOn(pluginEngine, 'getOutputNode').mockReturnValue(pluginOutput);
    vi.spyOn(effectsEngine, 'getInputNode').mockReturnValue(null);
    vi.spyOn(effectsEngine, 'getOutputNode').mockReturnValue(null);

    const result = buildCombinedEffectsChain('track-1');
    expect(result.input).toBe(pluginInput);
    expect(result.output).toBe(pluginOutput);
  });

  it('chains VST3 plugins before built-in effects when both exist', () => {
    const pluginInput = makeAudioNode('plugin-in');
    const pluginOutput = makeAudioNode('plugin-out');
    const effectsInput = makeAudioNode('effects-in');
    const effectsOutput = makeAudioNode('effects-out');

    vi.spyOn(pluginEngine, 'getInputNode').mockReturnValue(pluginInput);
    vi.spyOn(pluginEngine, 'getOutputNode').mockReturnValue(pluginOutput);
    vi.spyOn(effectsEngine, 'getInputNode').mockReturnValue(effectsInput);
    vi.spyOn(effectsEngine, 'getOutputNode').mockReturnValue(effectsOutput);

    const result = buildCombinedEffectsChain('track-1');

    // Combined chain: VST3 first, then built-in
    expect(result.input).toBe(pluginInput);
    expect(result.output).toBe(effectsOutput);
    // VST3 output connected to built-in input
    expect(pluginOutput.connect).toHaveBeenCalledWith(effectsInput);
  });
});

describe('calculatePluginDelayCompensation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('delays lower-latency tracks to match the maximum active plugin chain latency', () => {
    vi.spyOn(pluginEngine, 'getChainLatency').mockImplementation((trackId) => {
      if (trackId === 'track-late') return 512;
      if (trackId === 'track-mid') return 128;
      return 0;
    });

    const result = calculatePluginDelayCompensation(
      ['track-late', 'track-mid', 'track-dry'],
      48000,
    );

    expect(result.get('track-late')).toBe(0);
    expect(result.get('track-mid')).toBe(384);
    expect(result.get('track-dry')).toBe(512);
  });

  it('clears compensation when active plugin latencies are all zero', () => {
    vi.spyOn(pluginEngine, 'getChainLatency').mockReturnValue(0);

    const result = calculatePluginDelayCompensation(['track-a', 'track-b'], 48000);

    expect(result.get('track-a')).toBe(0);
    expect(result.get('track-b')).toBe(0);
  });

  it('accounts for group-bus latency without applying extra compensation to the bus', () => {
    vi.spyOn(pluginEngine, 'getChainLatency').mockImplementation((trackId) => {
      if (trackId === 'group-bus') return 512;
      if (trackId === 'track-child') return 128;
      return 0;
    });

    const result = calculatePluginDelayCompensationForTracks(
      [
        { id: 'group-bus', isGroup: true },
        { id: 'track-child', parentTrackId: 'group-bus' },
        { id: 'track-dry' },
      ],
      48000,
    );

    expect(result.get('group-bus')).toBe(0);
    expect(result.get('track-child')).toBe(0);
    expect(result.get('track-dry')).toBe(640);
  });
});
