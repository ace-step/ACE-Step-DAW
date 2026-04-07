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
