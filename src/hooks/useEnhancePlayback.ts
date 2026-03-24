import { useState, useCallback, useRef, useEffect } from 'react';
import { getAudioEngine } from './useAudioEngine';
import { loadAudioBlobByKey } from '../services/audioFileManager';
import { useTransportStore } from '../store/transportStore';

export interface EnhancePlaybackState {
  /** Which item is currently playing ('source' or a result id) */
  playingId: string | null;
  /** Current playback progress 0-1 */
  progress: number;
  /** Duration in seconds of the currently playing buffer */
  duration: number;
}

/**
 * Hook for one-shot audio playback in the Enhance Panel.
 * Uses Web Audio API AudioBufferSourceNode — independent of the main transport.
 */
export function useEnhancePlayback() {
  const [state, setState] = useState<EnhancePlaybackState>({
    playingId: null,
    progress: 0,
    duration: 0,
  });

  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef(0);
  const durationRef = useRef(0);
  const rafRef = useRef<number>(0);
  const seekOffsetRef = useRef(0);
  const bufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());

  const stopPlayback = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch {
        // Already stopped
      }
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    seekOffsetRef.current = 0;
    setState({ playingId: null, progress: 0, duration: 0 });
  }, []);

  // Animate progress via requestAnimationFrame
  const animateProgress = useCallback(() => {
    const engine = getAudioEngine();
    const elapsed = engine.ctx.currentTime - startTimeRef.current + seekOffsetRef.current;
    const dur = durationRef.current;
    if (dur > 0) {
      const p = Math.min(1, elapsed / dur);
      setState((prev) => ({ ...prev, progress: p }));
      if (p >= 1) {
        stopPlayback();
        return;
      }
    }
    rafRef.current = requestAnimationFrame(animateProgress);
  }, [stopPlayback]);

  /**
   * Load and decode an audio blob, with caching.
   */
  const loadBuffer = useCallback(async (audioKey: string): Promise<AudioBuffer | null> => {
    const cached = bufferCacheRef.current.get(audioKey);
    if (cached) return cached;

    const blob = await loadAudioBlobByKey(audioKey);
    if (!blob) return null;

    const engine = getAudioEngine();
    const buffer = await engine.decodeAudioData(blob);
    bufferCacheRef.current.set(audioKey, buffer);
    return buffer;
  }, []);

  /**
   * Play an audio buffer identified by audioKey.
   * @param id - Identifier for the playing item ('source' or result id)
   * @param audioKey - IDB key for the audio blob
   * @param seekProgress - Optional seek position (0-1)
   */
  const play = useCallback(
    async (id: string, audioKey: string, seekProgress = 0) => {
      // Stop any current playback first
      stopPlayback();

      const buffer = await loadBuffer(audioKey);
      if (!buffer) return;

      const engine = getAudioEngine();
      const ctx = engine.ctx;
      if (ctx.state === 'suspended') await ctx.resume();

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      const offset = seekProgress * buffer.duration;
      seekOffsetRef.current = offset;
      durationRef.current = buffer.duration;
      startTimeRef.current = ctx.currentTime;

      source.start(0, offset);
      sourceNodeRef.current = source;

      setState({ playingId: id, progress: seekProgress, duration: buffer.duration });
      rafRef.current = requestAnimationFrame(animateProgress);

      source.onended = () => {
        if (sourceNodeRef.current === source) {
          stopPlayback();
        }
      };
    },
    [stopPlayback, loadBuffer, animateProgress],
  );

  /**
   * Toggle playback — play if stopped or different id, stop if same id.
   */
  const togglePlay = useCallback(
    async (id: string, audioKey: string) => {
      if (state.playingId === id) {
        stopPlayback();
      } else {
        await play(id, audioKey);
      }
    },
    [state.playingId, play, stopPlayback],
  );

  /**
   * Seek to a position while playing.
   */
  const seek = useCallback(
    async (id: string, audioKey: string, progress: number) => {
      await play(id, audioKey, progress);
    },
    [play],
  );

  // Stop playback when the main transport starts playing (avoid audio overlap)
  useEffect(() => {
    const unsub = useTransportStore.subscribe((state) => {
      if (state.isPlaying) stopPlayback();
    });
    return unsub;
  }, [stopPlayback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
      bufferCacheRef.current.clear();
    };
  }, [stopPlayback]);

  return {
    ...state,
    play,
    togglePlay,
    seek,
    stopPlayback,
    loadBuffer,
  };
}
