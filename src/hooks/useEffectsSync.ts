/**
 * useEffectsSync.ts — Keeps the audio effect chain in sync with track store state.
 *
 * Runs at the app level so effects are always applied regardless of UI visibility.
 * Also wires sidechain compression when a compressor has sidechainSourceTrackId.
 */
import { useEffect } from 'react';
import { useProjectStore } from '../store/projectStore';
import { effectsEngine } from '../engine/EffectsEngine';
import { getAudioEngine } from './useAudioEngine';
import type { CompressorParams } from '../types/project';

export function useEffectsSync() {
  const tracks = useProjectStore((s) => s.project?.tracks);

  useEffect(() => {
    if (!tracks) return;

    const engine = getAudioEngine();

    // First pass: rebuild all effect chains
    for (const track of tracks) {
      const effects = track.effects ?? [];
      effectsEngine.rebuildChain(track.id, effects, track.effectsBypassed ?? false);
      const trackNode = engine.getOrCreateTrackNode(track.id);
      if (trackNode) {
        trackNode.spliceEffects(
          effectsEngine.getInputNode(track.id),
          effectsEngine.getOutputNode(track.id),
        );
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
          targetTrackNode.spliceEffects(
            effectsEngine.getInputNode(track.id),
            effectsEngine.getOutputNode(track.id),
          );
        }
      }
    }
  }, [tracks]);
}
