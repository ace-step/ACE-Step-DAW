/**
 * useEffectsSync.ts — Keeps the audio effect chain in sync with track store state.
 *
 * Runs at the app level so effects are always applied regardless of UI visibility.
 * Also wires sidechain compression when a compressor has sidechainSourceTrackId.
 * Initializes WASM DSP engine on mount when dspBackend !== 'tonejs'.
 */
import { useEffect, useRef } from 'react';
import { useProjectStore } from '../store/projectStore';
import { useUIStore } from '../store/uiStore';
import { useVST3Store } from '../store/vst3Store';
import { effectsEngine, initWasmDsp } from '../engine/EffectsEngine';
import { pluginEngine } from '../engine/PluginEngine';
import { getAudioEngine } from './useAudioEngine';
import type { CompressorParams } from '../types/project';

/**
 * Build a combined effects chain by chaining VST3 plugins before built-in effects.
 * Returns the combined input/output nodes to splice into the track's signal path.
 */
export function buildCombinedEffectsChain(trackId: string): { input: AudioNode | null; output: AudioNode | null } {
  const pluginInput = pluginEngine.getInputNode(trackId);
  const pluginOutput = pluginEngine.getOutputNode(trackId);
  const effectsInput = effectsEngine.getInputNode(trackId);
  const effectsOutput = effectsEngine.getOutputNode(trackId);

  const hasPlugins = pluginInput !== null && pluginOutput !== null;
  const hasEffects = effectsInput !== null && effectsOutput !== null;

  if (hasPlugins && hasEffects) {
    // Chain: VST3 plugins → built-in effects
    pluginOutput.connect(effectsInput);
    return { input: pluginInput, output: effectsOutput };
  }
  if (hasPlugins) {
    return { input: pluginInput, output: pluginOutput };
  }
  if (hasEffects) {
    return { input: effectsInput, output: effectsOutput };
  }
  return { input: null, output: null };
}

export function useEffectsSync() {
  const tracks = useProjectStore((s) => s.project?.tracks);
  const dspBackend = useUIStore((s) => s.dspBackend);
  const vst3Instances = useVST3Store((s) => s.instances);
  const wasmInitRef = useRef(false);

  // Initialize WASM DSP engine once when dspBackend allows it
  useEffect(() => {
    if (dspBackend === 'tonejs' || wasmInitRef.current) return;
    wasmInitRef.current = true;
    initWasmDsp().then((ok) => {
      if (ok) console.info('[useEffectsSync] WASM DSP ready');
    });
  }, [dspBackend]);

  // Disable WASM when user explicitly chooses Tone.js
  useEffect(() => {
    if (dspBackend === 'tonejs') {
      effectsEngine.setUseWasm(false);
    }
  }, [dspBackend]);

  // Sync effects when tracks or VST3 instances change
  useEffect(() => {
    if (!tracks) return;

    const engine = getAudioEngine();

    // First pass: rebuild built-in effect chains + sync VST3 bypass, then splice combined chain
    for (const track of tracks) {
      const effects = track.effects ?? [];
      effectsEngine.rebuildChain(track.id, effects, track.effectsBypassed ?? false);

      // Sync VST3 plugin bypass state with audio engine
      for (const inst of Object.values(vst3Instances)) {
        if (inst.trackId === track.id) {
          pluginEngine.setPluginBypassed(track.id, inst.instanceId, !inst.enabled);
        }
      }

      const trackNode = engine.getOrCreateTrackNode(track.id);
      if (trackNode) {
        const { input, output } = buildCombinedEffectsChain(track.id);
        trackNode.spliceEffects(input, output);

        // Apply VST3 latency compensation
        const pluginLatency = pluginEngine.getChainLatency(track.id);
        if (pluginLatency > 0) {
          const sampleRate = engine.ctx?.sampleRate ?? 44100;
          trackNode.setLatencyCompensation(pluginLatency, sampleRate);
        }
      }
    }

    // Second pass: wire sidechain connections (all chains must exist first)
    for (const track of tracks) {
      for (const effect of track.effects ?? []) {
        if (effect.type !== 'compressor') continue;
        const params = effect.params as CompressorParams;
        if (!params.sidechainSourceTrackId) continue;

        const sourceTrackNode = engine.getOrCreateTrackNode(params.sidechainSourceTrackId);
        if (!sourceTrackNode) continue;

        effectsEngine.connectSidechain(
          track.id,
          effect.id,
          sourceTrackNode.volumeGain,
          params,
        );
        // Re-splice output since sidechain may have changed the output node
        const targetTrackNode = engine.getOrCreateTrackNode(track.id);
        if (targetTrackNode) {
          const { input, output } = buildCombinedEffectsChain(track.id);
          targetTrackNode.spliceEffects(input, output);
        }
      }
    }
  }, [tracks, vst3Instances]);
}
