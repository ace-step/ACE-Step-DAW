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
async function getAudioBuffer(key: string): Promise<AudioBuffer | null> {
  const cached = audioBufferCache.get(key);
  if (cached) return cached;
  try {
    const blob = await loadAudioBlobByKey(key);
    if (!blob) return null;
    const buf = await getAudioEngine().decodeAudioData(blob);
    audioBufferCache.set(key, buf);
    if (audioBufferCache.size > 20) {
      const first = audioBufferCache.keys().next().value;
      if (first) audioBufferCache.delete(first);
    }
    return buf;
  } catch { return null; }
}

/**
 * Simple single-canvas waveform.
 *
 * Draws lineTo paths in a fixed-size canvas, then CSS width stretches it.
 * The path scales smoothly with CSS — no chunks, no backing-store issues.
 * Canvas resolution is fixed (e.g., 4000px) regardless of display width;
 * the path coordinates are continuous so scaling looks like smooth lines.
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
  const hiResReqRef = useRef<string | null>(null);

  const contentWidth = Math.max(width, 0);

  // Fixed canvas resolution — enough detail for smooth paths.
  // CSS width handles display scaling. Paths are continuous (lineTo)
  // so they scale smoothly at any CSS width.
  const CANVAS_WIDTH = 4000;

  const setCanvasRef = useCallback((el: HTMLCanvasElement | null) => {
    if (observerRef.current) { observerRef.current.disconnect(); observerRef.current = null; }
    canvasRef.current = el;
    if (el) {
      const ro = new ResizeObserver(() => setResizeTick((t) => t + 1));
      ro.observe(el);
      observerRef.current = ro;
      setResizeTick((t) => t + 1);
    }
  }, []);
  useEffect(() => () => { observerRef.current?.disconnect(); }, []);

  // High-res peaks from raw audio
  useEffect(() => {
    if (!peaks || !audioKey) return;
    const logicalPeakCount = Math.floor(peaks.length / PEAK_STRIDE);
    // If we already have enough peaks for our canvas resolution, skip
    if (logicalPeakCount >= CANVAS_WIDTH) {
      if (hiResPeaks) setHiResPeaks(null);
      hiResReqRef.current = null;
      return;
    }
    const target = CANVAS_WIDTH;
    const reqKey = `${audioKey}:${target}`;
    if (hiResReqRef.current === reqKey && hiResPeaks) return;

    let cancelled = false;
    hiResReqRef.current = reqKey;
    void (async () => {
      const buf = await getAudioBuffer(audioKey);
      if (cancelled || !buf) return;
      const p = computeWaveformPeaks(buf, target);
      if (!cancelled) setHiResPeaks(p);
    })();
    return () => { cancelled = true; };
  }, [audioKey, peaks, hiResPeaks, CANVAS_WIDTH]);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    const activePeaks = hiResPeaks ?? peaks;
    if (!canvas || !activePeaks || activePeaks.length === 0 || contentWidth <= 0) return;

    const canvasHeight = canvas.clientHeight;
    if (canvasHeight <= 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fixed backing store size — paths will scale via CSS
    const bw = CANVAS_WIDTH;
    const bh = Math.round(canvasHeight * (window.devicePixelRatio || 1));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;

    ctx.resetTransform();
    ctx.clearRect(0, 0, bw, bh);

    // Scale Y to backing height, X stays as-is (CANVAS_WIDTH)
    const scaleY = bh / canvasHeight;
    ctx.scale(1, scaleY);

    drawWaveform(ctx, {
      peaks: activePeaks,
      audioDuration,
      audioOffset,
      clipDuration,
      contentOffset,
      timeStretchRate,
      stretchMode,
      width: bw,
      height: canvasHeight,
      color,
      opacity: 1,
      trackVolume,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiResPeaks, peaks, audioDuration, audioOffset, clipDuration, contentOffset, timeStretchRate, stretchMode, contentWidth, color, trackVolume, resizeTick, CANVAS_WIDTH]);

  const activePeaks = hiResPeaks ?? peaks;
  if (!activePeaks || activePeaks.length === 0 || contentWidth <= 0) return null;

  return (
    <div className={`absolute inset-0 overflow-hidden ${opacityClassName}`}>
      <canvas
        ref={setCanvasRef}
        data-testid="canvas-waveform"
        role="img"
        aria-label="Audio waveform"
        style={{
          width: contentWidth,
          height: '100%',
        }}
      />
    </div>
  );
}
