import { useRef, useEffect, useState, useCallback } from 'react';
import type { StretchMode } from '../../types/project';
import { drawWaveform } from './waveformRenderer';
import { PEAK_STRIDE } from '../../utils/waveformPeaks';
import { computeWaveformPeaks } from '../../utils/waveformPeaks';
import { loadAudioBlobByKey } from '../../services/audioFileManager';
import { getAudioEngine } from '../../hooks/useAudioEngine';

interface CanvasClipWaveformProps {
  peaks: number[] | null;
  /** IndexedDB key for raw audio — used to compute high-res peaks on zoom. */
  audioKey: string | null;
  audioDuration: number;
  audioOffset: number;
  clipDuration: number;
  contentOffset?: number;
  timeStretchRate?: number;
  stretchMode?: StretchMode;
  width: number;
  color: string;
  opacityClassName?: string;
  trackVolume?: number;
}

/**
 * Module-level cache for decoded AudioBuffers so we only decode once per key.
 */
const audioBufferCache = new Map<string, AudioBuffer>();

/**
 * Load and decode an audio blob, using a module-level cache.
 */
async function getAudioBuffer(audioKey: string): Promise<AudioBuffer | null> {
  const cached = audioBufferCache.get(audioKey);
  if (cached) return cached;

  try {
    const blob = await loadAudioBlobByKey(audioKey);
    if (!blob) return null;
    const buffer = await getAudioEngine().decodeAudioData(blob);
    audioBufferCache.set(audioKey, buffer);
    // Limit cache size to 20 entries
    if (audioBufferCache.size > 20) {
      const firstKey = audioBufferCache.keys().next().value;
      if (firstKey) audioBufferCache.delete(firstKey);
    }
    return buffer;
  } catch {
    return null;
  }
}

/**
 * Canvas-based waveform renderer with dynamic resolution.
 *
 * Uses pre-computed peaks for overview (zoomed out).
 * When zoomed in past the pre-computed resolution, loads the raw audio
 * from IndexedDB and computes peaks at exactly the needed column count.
 * This gives ACE Studio-quality crispness at any zoom level.
 */
export function CanvasClipWaveform({
  peaks,
  audioKey,
  audioDuration,
  audioOffset,
  clipDuration,
  contentOffset,
  timeStretchRate,
  stretchMode,
  width,
  color,
  opacityClassName = 'opacity-90',
  trackVolume = 1,
}: CanvasClipWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const [resizeTick, setResizeTick] = useState(0);

  // High-res peaks computed from raw audio (null = use prop peaks)
  const [hiResPeaks, setHiResPeaks] = useState<number[] | null>(null);
  const hiResRequestRef = useRef<{ key: string; count: number } | null>(null);

  const contentWidth = Math.max(width, 0);

  // Callback ref for ResizeObserver
  const setCanvasRef = useCallback((el: HTMLCanvasElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    canvasRef.current = el;
    if (el) {
      const observer = new ResizeObserver(() => setResizeTick((t) => t + 1));
      observer.observe(el);
      observerRef.current = observer;
      setResizeTick((t) => t + 1);
    }
  }, []);

  useEffect(() => () => { observerRef.current?.disconnect(); }, []);

  // Compute high-res peaks from raw audio when zoomed in past pre-computed resolution
  useEffect(() => {
    if (!peaks || !audioKey) return;

    const dpr = window.devicePixelRatio || 1;
    const neededColumns = Math.round(contentWidth * dpr);
    const logicalPeakCount = Math.floor(peaks.length / PEAK_STRIDE);

    // If pre-computed peaks have enough resolution, use them
    if (neededColumns <= logicalPeakCount * 1.5) {
      if (hiResPeaks) setHiResPeaks(null);
      hiResRequestRef.current = null;
      return;
    }

    // Round to nearest power of 2 to avoid recomputing on tiny zoom changes
    const targetCount = Math.min(32768, Math.max(logicalPeakCount * 2, 1 << Math.ceil(Math.log2(neededColumns))));
    const reqKey = `${audioKey}:${targetCount}`;

    // Already computed at this resolution
    if (hiResRequestRef.current?.key === reqKey && hiResPeaks) return;

    let cancelled = false;
    hiResRequestRef.current = { key: reqKey, count: targetCount };

    void (async () => {
      const buffer = await getAudioBuffer(audioKey);
      if (cancelled || !buffer) return;
      const newPeaks = computeWaveformPeaks(buffer, targetCount);
      if (!cancelled) setHiResPeaks(newPeaks);
    })();

    return () => { cancelled = true; };
  }, [audioKey, peaks, contentWidth, hiResPeaks]);

  // Draw effect
  useEffect(() => {
    const canvas = canvasRef.current;
    const activePeaks = hiResPeaks ?? peaks;
    if (!canvas || !activePeaks || activePeaks.length === 0 || contentWidth <= 0) return;

    const canvasHeight = canvas.clientHeight;
    if (canvasHeight <= 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const backingWidth = Math.min(Math.round(contentWidth * dpr), 16384);
    const backingHeight = Math.round(canvasHeight * dpr);
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;

    // Draw in backing-store pixel space for crisp, pixel-perfect rendering.
    // Disable image smoothing so fillRect edges are razor-sharp.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, backingWidth, backingHeight);

    drawWaveform(ctx, {
      peaks: activePeaks,
      audioDuration,
      audioOffset,
      clipDuration,
      contentOffset,
      timeStretchRate,
      stretchMode,
      width: backingWidth,
      height: backingHeight,
      color,
      opacity: 1,
      trackVolume,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiResPeaks, peaks, audioDuration, audioOffset, clipDuration, contentOffset, timeStretchRate, stretchMode, contentWidth, color, trackVolume, resizeTick]);

  const activePeaks = hiResPeaks ?? peaks;
  if (!activePeaks || activePeaks.length === 0 || contentWidth <= 0) {
    return null;
  }

  return (
    <div className={`absolute inset-0 flex items-center overflow-hidden ${opacityClassName}`}>
      <canvas
        ref={setCanvasRef}
        role="img"
        aria-label="Audio waveform"
        data-testid="canvas-waveform"
        style={{
          width: contentWidth,
          height: '100%',
          imageRendering: 'pixelated',
        }}
      />
    </div>
  );
}
