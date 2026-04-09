import { useRef, useEffect, useState, useCallback } from 'react';
import type { StretchMode } from '../../types/project';
import { drawWaveform } from './waveformRenderer';
import { PEAK_STRIDE, computeWaveformPeaks } from '../../utils/waveformPeaks';
import { loadAudioBlobByKey } from '../../services/audioFileManager';
import { getAudioEngine } from '../../hooks/useAudioEngine';

interface CanvasClipWaveformProps {
  peaks: number[] | null;
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

const audioBufferCache = new Map<string, AudioBuffer>();
async function getAudioBuffer(audioKey: string): Promise<AudioBuffer | null> {
  const cached = audioBufferCache.get(audioKey);
  if (cached) return cached;
  try {
    const blob = await loadAudioBlobByKey(audioKey);
    if (!blob) return null;
    const buffer = await getAudioEngine().decodeAudioData(blob);
    audioBufferCache.set(audioKey, buffer);
    if (audioBufferCache.size > 20) {
      const first = audioBufferCache.keys().next().value;
      if (first) audioBufferCache.delete(first);
    }
    return buffer;
  } catch { return null; }
}

/**
 * Canvas waveform renderer — full clip width, pixel-perfect.
 *
 * Renders the full clip. The backing store is capped at 16384 (browser limit).
 * For clips wider than 16384/dpr CSS pixels, we use as many backing pixels
 * as possible — the browser's native canvas scaling handles the rest.
 * With imageSmoothingEnabled=false, this stays sharp even when scaled.
 *
 * For zoom-in detail: dynamically recomputes peaks from raw audio via
 * IndexedDB when the pre-computed peaks are too coarse.
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
  const [hiResPeaks, setHiResPeaks] = useState<number[] | null>(null);
  const hiResRequestRef = useRef<string | null>(null);

  const contentWidth = Math.max(width, 0);

  const setCanvasRef = useCallback((el: HTMLCanvasElement | null) => {
    if (observerRef.current) { observerRef.current.disconnect(); observerRef.current = null; }
    canvasRef.current = el;
    if (el) {
      const observer = new ResizeObserver(() => setResizeTick((t) => t + 1));
      observer.observe(el);
      observerRef.current = observer;
      setResizeTick((t) => t + 1);
    }
  }, []);
  useEffect(() => () => { observerRef.current?.disconnect(); }, []);

  // High-res peaks from raw audio when zoomed past pre-computed resolution
  useEffect(() => {
    if (!peaks || !audioKey) return;
    const dpr = window.devicePixelRatio || 1;
    // Target: one logical peak per backing pixel, capped at 16384
    const neededColumns = Math.min(16384, Math.round(contentWidth * dpr));
    const logicalPeakCount = Math.floor(peaks.length / PEAK_STRIDE);
    if (neededColumns <= logicalPeakCount * 1.5) {
      if (hiResPeaks) setHiResPeaks(null);
      hiResRequestRef.current = null;
      return;
    }
    const targetCount = Math.min(16384, Math.max(logicalPeakCount * 2, 1 << Math.ceil(Math.log2(neededColumns))));
    const reqKey = `${audioKey}:${targetCount}`;
    if (hiResRequestRef.current === reqKey && hiResPeaks) return;

    let cancelled = false;
    hiResRequestRef.current = reqKey;
    void (async () => {
      const buffer = await getAudioBuffer(audioKey);
      if (cancelled || !buffer) return;
      const newPeaks = computeWaveformPeaks(buffer, targetCount);
      if (!cancelled) setHiResPeaks(newPeaks);
    })();
    return () => { cancelled = true; };
  }, [audioKey, peaks, contentWidth, hiResPeaks]);

  // Draw
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

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, backingWidth, backingHeight);

    // Draw in backing-store coordinates. Column count = backingWidth so
    // each fillRect is exactly 1 backing pixel wide.
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
    <div className={`absolute inset-0 overflow-hidden ${opacityClassName}`}>
      <canvas
        ref={setCanvasRef}
        role="img"
        aria-label="Audio waveform"
        data-testid="canvas-waveform"
        style={{
          width: contentWidth,
          height: '100%',
          imageRendering: 'auto',
        }}
      />
    </div>
  );
}
