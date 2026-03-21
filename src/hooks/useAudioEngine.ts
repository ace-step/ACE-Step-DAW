import { useRef, useEffect, useCallback } from 'react';
import * as Tone from 'tone';
import { AudioEngine } from '../engine/AudioEngine';
import { useTransportStore } from '../store/transportStore';
import { useProjectStore } from '../store/projectStore';

let _engineInstance: AudioEngine | null = null;
let _audioResumed = false;

/** @internal Set audio-resumed flag — for tests only */
export function _setAudioResumed(value: boolean) {
  _audioResumed = value;
}

export function getAudioEngine(): AudioEngine {
  if (!_engineInstance) {
    _engineInstance = new AudioEngine();
  }
  return _engineInstance;
}

export function getExistingAudioEngine(): AudioEngine | null {
  return _engineInstance;
}

export function useAudioEngine() {
  const engineRef = useRef<AudioEngine>(getAudioEngine());

  useEffect(() => {
    const engine = engineRef.current;
    engine.setTimeUpdateCallback((time) => {
      useTransportStore.getState().setCurrentTime(time);
    });

    return () => {
      engine.setTimeUpdateCallback(() => {});
    };
  }, []);

  const resumeOnGesture = useCallback(async () => {
    await Promise.all([
      engineRef.current.resume(),
      Tone.start(),
    ]);
    const latency = engineRef.current.refreshPlaybackLatencyCompensation();
    const store = (await import('../store/projectStore')).useProjectStore.getState();
    store.detectPlaybackLatency(latency);
    engineRef.current.setPlaybackLatencyCompensation(
      useProjectStore.getState().project?.playbackLatency?.compensationMs
        ? useProjectStore.getState().project!.playbackLatency!.compensationMs / 1000
        : 0,
    );
  }, []);

  // Auto-resume AudioContext on first user interaction (click or keydown)
  useEffect(() => {
    if (_audioResumed) return;

    const handler = () => {
      if (_audioResumed) return;
      _audioResumed = true;
      void resumeOnGesture();
      window.removeEventListener('click', handler, true);
      window.removeEventListener('keydown', handler, true);
    };

    window.addEventListener('click', handler, true);
    window.addEventListener('keydown', handler, true);

    return () => {
      window.removeEventListener('click', handler, true);
      window.removeEventListener('keydown', handler, true);
    };
  }, [resumeOnGesture]);

  return { engine: engineRef.current, resumeOnGesture };
}
