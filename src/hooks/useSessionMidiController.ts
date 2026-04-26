import { useEffect, useState, useCallback } from 'react';
import { useProjectStore } from '../store/projectStore';
import { useTransport } from './useTransport';
import {
  initMidiController,
  setMidiEventHandler,
  setMidiStateChangeHandler,
  disconnectMidiController,
  type MidiControllerState,
  type MidiMapping,
} from '../services/midiControllerService';
import { getSessionClips } from '../utils/sessionClips';

/**
 * Hook that connects a MIDI controller to session view clip/scene launching.
 * Call this from SessionView to enable MIDI controller support.
 */
export function useSessionMidiController(enabled: boolean) {
  const [midiState, setMidiState] = useState<MidiControllerState>({
    isAvailable: false,
    isConnected: false,
    deviceName: null,
    inputId: null,
  });

  const project = useProjectStore((s) => s.project);
  const { launchSessionClip, launchSessionScene, stopSessionTrack, stopAllSessionClips } = useTransport();

  const handleMidiEvent = useCallback((mapping: MidiMapping) => {
    if (!project) return;
    const tracks = [...project.tracks].sort((a, b) => a.order - b.order);
    const scenes = project.session?.scenes ?? [];

    switch (mapping.type) {
      case 'scene': {
        if (mapping.sceneIndex !== undefined && mapping.sceneIndex < scenes.length) {
          const sceneIndex = mapping.sceneIndex;
          const sceneLaunches = tracks.flatMap((track) => {
            const clip = getSessionClips(track)[sceneIndex];
            return clip ? [{ trackId: track.id, clipId: clip.id }] : [];
          });
          void launchSessionScene(sceneIndex, sceneLaunches);
        }
        break;
      }
      case 'clip': {
        if (
          mapping.trackIndex !== undefined &&
          mapping.sceneIndex !== undefined &&
          mapping.trackIndex < tracks.length
        ) {
          const track = tracks[mapping.trackIndex];
          const clip = getSessionClips(track)[mapping.sceneIndex];
          if (clip) {
            void launchSessionClip(track.id, clip.id, mapping.sceneIndex);
          }
        }
        break;
      }
      case 'stop-track': {
        if (mapping.trackIndex !== undefined && mapping.trackIndex < tracks.length) {
          void stopSessionTrack(tracks[mapping.trackIndex].id);
        }
        break;
      }
      case 'stop-all': {
        void stopAllSessionClips();
        break;
      }
    }
  }, [project, launchSessionClip, launchSessionScene, stopSessionTrack, stopAllSessionClips]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    initMidiController().then((state) => {
      if (!cancelled) {
        setMidiState(state);
      }
    }).catch(() => {
      // Web MIDI may be unsupported — leave default disconnected state
    });

    setMidiEventHandler(handleMidiEvent);
    setMidiStateChangeHandler((state) => {
      if (!cancelled) setMidiState(state);
    });

    return () => {
      cancelled = true;
      setMidiStateChangeHandler(null);
      disconnectMidiController();
    };
  }, [enabled, handleMidiEvent]);

  return midiState;
}
