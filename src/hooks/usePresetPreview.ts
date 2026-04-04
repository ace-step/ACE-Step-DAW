/**
 * usePresetPreview — React hook for sound preview in preset browsers.
 *
 * Provides hover-to-preview (300ms delay), click-to-preview, volume control,
 * auto-stop on mouse leave, and keyboard support.
 */
import { useCallback, useRef, useEffect, useState } from 'react';
import { previewEngine } from '../engine/PreviewEngine';
import { useProjectStore } from '../store/projectStore';

interface UsePresetPreviewOptions {
  /** Delay in ms before hover preview starts (default 300) */
  hoverDelay?: number;
  /** Whether hover preview is enabled (default true) */
  hoverEnabled?: boolean;
}

interface PresetPreviewInfo {
  instrumentKind: 'subtractive' | 'fm' | 'wavetable';
  category: string;
}

export function usePresetPreview(options: UsePresetPreviewOptions = {}) {
  const { hoverDelay = 300, hoverEnabled = true } = options;
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(previewEngine.volume);
  const activePresetRef = useRef<string | null>(null);

  const getBpm = useCallback(() => {
    return useProjectStore.getState().project?.bpm ?? 120;
  }, []);

  const play = useCallback((presetId: string, info: PresetPreviewInfo) => {
    activePresetRef.current = presetId;
    setIsPlaying(true);
    previewEngine.playPresetPreview(info.instrumentKind, info.category, getBpm()).then(() => {
      // Check if we're still supposed to be playing this preset
      // (another preview may have started since)
    });
  }, [getBpm]);

  const stop = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    activePresetRef.current = null;
    previewEngine.stop();
    setIsPlaying(false);
  }, []);

  const handlePresetHoverStart = useCallback((presetId: string, info: PresetPreviewInfo) => {
    if (!hoverEnabled) return;

    // Clear any pending hover timer
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }

    hoverTimerRef.current = setTimeout(() => {
      play(presetId, info);
    }, hoverDelay);
  }, [hoverEnabled, hoverDelay, play]);

  const handlePresetHoverEnd = useCallback(() => {
    stop();
  }, [stop]);

  const handlePresetClick = useCallback((presetId: string, info: PresetPreviewInfo) => {
    if (activePresetRef.current === presetId && isPlaying) {
      stop();
    } else {
      play(presetId, info);
    }
  }, [isPlaying, play, stop]);

  const changeVolume = useCallback((vol: number) => {
    previewEngine.setVolume(vol);
    setVolume(previewEngine.volume);
  }, []);

  // Sync isPlaying state with engine
  useEffect(() => {
    const interval = setInterval(() => {
      if (isPlaying && !previewEngine.isPlaying) {
        setIsPlaying(false);
        activePresetRef.current = null;
      }
    }, 200);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
      previewEngine.stop();
    };
  }, []);

  return {
    isPlaying,
    activePresetId: activePresetRef.current,
    volume,
    play,
    stop,
    changeVolume,
    handlePresetHoverStart,
    handlePresetHoverEnd,
    handlePresetClick,
  };
}
