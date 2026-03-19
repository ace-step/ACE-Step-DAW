/**
 * useReturnBusSync.ts — Keeps return bus audio nodes in sync with project store state.
 *
 * Runs at the app level to ensure send amounts and return bus parameters
 * (volume, mute, pan) are always reflected in the audio engine.
 */
import { useEffect } from 'react';
import { useProjectStore } from '../store/projectStore';
import { getAudioEngine } from './useAudioEngine';

export function useReturnBusSync() {
  const returnTracks = useProjectStore((s) => s.project?.returnTracks);
  const tracks = useProjectStore((s) => s.project?.tracks);

  useEffect(() => {
    if (!tracks) return;
    const engine = getAudioEngine();
    engine.syncReturnBuses(returnTracks ?? [], tracks);
  }, [returnTracks, tracks]);
}
