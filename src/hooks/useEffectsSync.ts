/**
 * useEffectsSync.ts — Keeps the audio effect chain in sync with track store state.
 *
 * Previously, effects were only wired when the EffectChain panel was open.
 * This hook runs at the app level and ensures effects are always applied,
 * regardless of whether the Mixer/EffectChain UI is visible.
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

    for (const track of tracks) {
      const effects = track.effects ?? [];
      // Build the Tone.js chain for this track
      effectsEngine.rebuildChain(track.id, effects);
      // Splice into the Web Audio signal path
      const trackNode = engine.getOrCreateTrackNode(track.id);
      if (trackNode) {
        trackNode.spliceEffects(
          effectsEngine.getInputNode(track.id),
          effectsEngine.getOutputNode(track.id),
        );
      }

      // Set up sidechain routing for compressors with sidechainSourceTrackId
      for (const effect of effects) {
        if (effect.type !== 'compressor' || !effect.enabled) continue;
        const params = effect.params as CompressorParams;
        if (params.sidechainSourceTrackId) {
          const sourceTrackNode = engine.getOrCreateTrackNode(params.sidechainSourceTrackId);
          if (sourceTrackNode) {
            effectsEngine.setupSidechain(
              track.id,
              effect.id,
              sourceTrackNode.volumeGain,
              engine.ctx,
              params,
            );
          }
        } else {
          effectsEngine.removeSidechain(track.id, effect.id);
        }
      }
    }
  }, [tracks]);
}
