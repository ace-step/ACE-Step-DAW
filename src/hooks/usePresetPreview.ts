/**
 * usePresetPreview — React hook for sound preview in preset browsers.
 *
 * Provides hover-to-preview (300ms delay), click-to-preview, volume control,
 * auto-stop on mouse leave, and keyboard support.
 */
import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { previewEngine } from '../engine/PreviewEngine';
import { useProjectStore } from '../store/projectStore';

interface UsePresetPreviewOptions {
  /** Delay in ms before hover preview starts (default 300) */
  hoverDelay?: number;
  /** Whether hover preview is enabled (default true) */
  hoverEnabled?: boolean;
}

interface PresetPreviewInfo {
  instrumentKind: 'subtractive' | 'fm' | 'wavetable' | 'granular' | 'additive' | 'physical';
  category: string;
}

export function usePresetPreview(options: UsePresetPreviewOptions = {}) {
  const { hoverDelay = 300, hoverEnabled = true } = options;
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(previewEngine.volume);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  const getProjectSettings = useCallback(() => {
    const project = useProjectStore.getState().project;
    return {
      bpm: project?.bpm ?? 120,
      keyScale: project?.keyScale ?? 'C major',
    };
  }, []);

  const play = useCallback((presetId: string, info: PresetPreviewInfo) => {
    // Clear any pending hover timer to prevent race with click
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setActivePresetId(presetId);
    setIsPlaying(true);
    const { bpm, keyScale } = getProjectSettings();
    previewEngine.playPresetPreview(info.instrumentKind, info.category, bpm, keyScale);
  }, [getProjectSettings]);

  const stop = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setActivePresetId(null);
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
    if (activePresetId === presetId && isPlaying) {
      stop();
    } else {
      play(presetId, info);
    }
  }, [isPlaying, activePresetId, play, stop]);

  const changeVolume = useCallback((vol: number) => {
    previewEngine.setVolume(vol);
    setVolume(previewEngine.volume);
  }, []);

  // Sync isPlaying state with engine — only poll when playing
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      if (!previewEngine.isPlaying) {
        setIsPlaying(false);
        setActivePresetId(null);
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

  return useMemo(() => ({
    isPlaying,
    activePresetId,
    volume,
    play,
    stop,
    changeVolume,
    handlePresetHoverStart,
    handlePresetHoverEnd,
    handlePresetClick,
  }), [isPlaying, activePresetId, volume, play, stop, changeVolume, handlePresetHoverStart, handlePresetHoverEnd, handlePresetClick]);
}
