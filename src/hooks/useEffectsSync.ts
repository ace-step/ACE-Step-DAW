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
import { createDebugLogger } from '../utils/debugLogger';
import type { CompressorParams } from '../types/project';

const logger = createDebugLogger('ace-step:effects-sync');
import type { VST3ActiveInstance } from '../types/vst3';

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
    // Disconnect prior edge to avoid duplicate parallel connections on re-sync
    try { pluginOutput.disconnect(effectsInput); } catch { /* no prior connection */ }
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

/**
 * Derive a stable fingerprint of VST3 instances for effect chain syncing.
 * Only includes fields that affect audio routing (instanceId, trackId, enabled).
 */
function selectVst3EffectChainKey(s: { instances: Record<string, VST3ActiveInstance> }): string {
  const parts: string[] = [];
  for (const [id, inst] of Object.entries(s.instances)) {
    parts.push(`${id}:${inst.trackId ?? ''}:${inst.enabled ? '1' : '0'}`);
  }
  return parts.sort().join('|');
}

export function useEffectsSync() {
  const tracks = useProjectStore((s) => s.project?.tracks);
  const dspBackend = useUIStore((s) => s.dspBackend);
  // Subscribe to a stable fingerprint so we only re-render on routing-relevant changes
  const vst3ChainKey = useVST3Store(selectVst3EffectChainKey);
  const wasmInitRef = useRef(false);

  // Initialize WASM DSP engine once when dspBackend allows it
  useEffect(() => {
    if (dspBackend === 'tonejs' || wasmInitRef.current) return;
    wasmInitRef.current = true;
    initWasmDsp().then((ok) => {
      if (ok) logger.info('WASM DSP ready');
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

    // Pre-group VST3 instances by trackId to avoid O(tracks*instances) loop
    const vst3Instances = useVST3Store.getState().instances;
    const instancesByTrack = new Map<string, { instanceId: string; enabled: boolean }[]>();
    for (const inst of Object.values(vst3Instances)) {
      if (!inst.trackId) continue;
      const list = instancesByTrack.get(inst.trackId) ?? [];
      list.push({ instanceId: inst.instanceId, enabled: inst.enabled });
      instancesByTrack.set(inst.trackId, list);
    }

    // First pass: rebuild built-in effect chains + sync VST3 bypass, then splice combined chain
    for (const track of tracks) {
      const effects = track.effects ?? [];
      effectsEngine.rebuildChain(track.id, effects, track.effectsBypassed ?? false);

      // Sync VST3 plugin bypass state with audio engine
      const trackInstances = instancesByTrack.get(track.id);
      if (trackInstances) {
        for (const inst of trackInstances) {
          pluginEngine.setPluginBypassed(track.id, inst.instanceId, !inst.enabled);
        }
      }

      const trackNode = engine.getOrCreateTrackNode(track.id);
      if (trackNode) {
        const { input, output } = buildCombinedEffectsChain(track.id);
        trackNode.spliceEffects(input, output);

        // Always apply latency compensation (including clearing to 0 when plugins removed/bypassed)
        const pluginLatency = pluginEngine.getChainLatency(track.id);
        const sampleRate = engine.ctx?.sampleRate ?? 44100;
        trackNode.setLatencyCompensation(pluginLatency, sampleRate);
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
  }, [tracks, vst3ChainKey]);
}
