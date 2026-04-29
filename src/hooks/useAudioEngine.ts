import { useRef, useEffect, useCallback } from 'react';
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
    // AudioEngine.resume() resumes the underlying AudioContext that
    // Tone.js also uses — AudioEngine's constructor calls
    // `Tone.setContext(ctx)` so `Tone.start()` (which is literally
    // `globalContext.resume()` in tone@15.1.22) would resume the
    // same context. The parallel `Promise.all([engine.resume(),
    // Tone.start()])` was redundant work. Verified by codex review
    // on PR #1727.
    await engineRef.current.resume();
    const latency = engineRef.current.refreshPlaybackLatencyCompensation();
    const store = (await import('../store/projectStore')).useProjectStore.getState();
    store.detectPlaybackLatency(latency);
    const compensationMs = useProjectStore.getState().project?.playbackLatency?.compensationMs;
    engineRef.current.setPlaybackLatencyCompensation(
      compensationMs ? compensationMs / 1000 : 0,
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
