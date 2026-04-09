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
 * Single-canvas waveform renderer with dynamic peak resolution.
 *
 * Uses ctx.scale(dpr, dpr) to draw in CSS-pixel coordinates, then the
 * browser maps backing-store pixels to device pixels. The backing store
 * is capped at 16384, so very wide clips get fewer backing pixels per
 * CSS pixel — but with crisp-edges rendering this stays acceptably sharp.
 *
 * When zoomed in, loads raw audio from IndexedDB and recomputes peaks
 * at higher resolution for true sample-level detail.
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
    const backingWidth = Math.min(Math.round(contentWidth * dpr), 16384);
    const logicalPeakCount = Math.floor(peaks.length / PEAK_STRIDE);
    if (backingWidth <= logicalPeakCount * 1.2) {
      if (hiResPeaks) setHiResPeaks(null);
      hiResRequestRef.current = null;
      return;
    }
    const targetCount = Math.min(16384, Math.max(logicalPeakCount * 2, backingWidth));
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

    // Draw directly in backing-store pixel space (identity transform).
    // 1 column = 1 backing pixel. The browser handles CSS↔backing scaling.
    ctx.resetTransform();
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
    <div className={`absolute inset-0 overflow-hidden ${opacityClassName}`}>
      <canvas
        ref={setCanvasRef}
        role="img"
        aria-label="Audio waveform"
        data-testid="canvas-waveform"
        style={{
          width: contentWidth,
          height: '100%',
        }}
      />
    </div>
  );
}
