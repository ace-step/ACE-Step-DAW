import { useRef, useEffect, useState, useCallback } from 'react';
import type { StretchMode } from '../../types/project';
import { drawWaveform } from './waveformRenderer';
import { PEAK_STRIDE, computeWaveformPeaks } from '../../utils/waveformPeaks';
import { loadAudioBlobByKey } from '../../services/audioFileManager';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { useUIStore } from '../../store/uiStore';

interface CanvasClipWaveformProps {
  peaks: number[] | null;
  audioKey: string | null;
  audioDuration: number;
  audioOffset: number;
  clipDuration: number;
  contentOffset?: number;
  timeStretchRate?: number;
  stretchMode?: StretchMode;
  /** Full clip width in CSS pixels. */
  width: number;
  color: string;
  opacityClassName?: string;
  trackVolume?: number;
}

// Module-level AudioBuffer cache (LRU, max 20)
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
 * Canvas waveform renderer — viewport-clipped, pixel-perfect at any zoom.
 *
 * The canvas element is only as wide as the VISIBLE portion of the clip
 * (clamped to viewport bounds). This means the backing store never exceeds
 * viewport_width × DPR pixels — no stretching, no blur, vector-quality
 * crispness at every zoom level.
 *
 * When zoomed in past pre-computed peak resolution, loads raw audio from
 * IndexedDB and recomputes peaks at the exact resolution needed.
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
  width: fullClipWidth,
  color,
  opacityClassName = 'opacity-90',
  trackVolume = 1,
}: CanvasClipWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const [resizeTick, setResizeTick] = useState(0);
  const [hiResPeaks, setHiResPeaks] = useState<number[] | null>(null);
  const hiResRequestRef = useRef<string | null>(null);

  // Read scroll position and viewport width from the UI store
  const scrollX = useUIStore((s) => s.scrollX);
  const trackListWidth = useUIStore((s) => s.trackListWidth);
  const viewportWidth = useUIStore((s) => s.timelineViewportWidth);

  const contentWidth = Math.max(fullClipWidth, 0);

  // Callback ref for ResizeObserver
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

  // Compute the visible slice of this clip relative to the viewport.
  // The clip's left edge in timeline coordinates is determined by the parent
  // ClipBlock's positioning. We figure out what fraction is visible.
  // Note: we get the parent's offsetLeft from the DOM in the draw effect.

  // High-res peaks from raw audio
  useEffect(() => {
    if (!peaks || !audioKey) return;
    const dpr = window.devicePixelRatio || 1;
    // Use viewport width (not full clip width) for resolution target
    const neededColumns = Math.round(Math.min(contentWidth, viewportWidth + 200) * dpr);
    const logicalPeakCount = Math.floor(peaks.length / PEAK_STRIDE);
    if (neededColumns <= logicalPeakCount * 1.5) {
      if (hiResPeaks) setHiResPeaks(null);
      hiResRequestRef.current = null;
      return;
    }
    const targetCount = Math.min(32768, Math.max(logicalPeakCount * 2, 1 << Math.ceil(Math.log2(neededColumns))));
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
  }, [audioKey, peaks, contentWidth, viewportWidth, hiResPeaks]);

  // Draw effect — renders only the visible portion of the clip
  useEffect(() => {
    const canvas = canvasRef.current;
    const activePeaks = hiResPeaks ?? peaks;
    if (!canvas || !activePeaks || activePeaks.length === 0 || contentWidth <= 0) return;

    const canvasHeight = canvas.clientHeight;
    if (canvasHeight <= 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    // Compute visible portion of this clip.
    // The canvas parent chain: canvas → div.absolute.inset-0 → div(waveform container) → clip block
    // The clip block has style.left set by the parent. We use the canvas's own
    // getBoundingClientRect to figure out how much is visible.
    const canvasRect = canvas.getBoundingClientRect();
    const parentScroll = canvas.closest('#arrangement-timeline-scroll');
    const scrollRect = parentScroll?.getBoundingClientRect();

    let visibleLeft = 0;
    let visibleWidthCSS = contentWidth;

    if (scrollRect && canvasRect.width > 0) {
      const clipScreenLeft = canvasRect.left;
      const viewLeft = scrollRect.left + trackListWidth;
      const viewRight = scrollRect.right;

      // How much of the clip is before the viewport
      visibleLeft = Math.max(0, viewLeft - clipScreenLeft) / 1; // in CSS px relative to clip start
      // How much is after the viewport
      const clipScreenRight = canvasRect.right;
      const rightClip = Math.max(0, clipScreenRight - viewRight);
      visibleWidthCSS = Math.max(1, contentWidth - visibleLeft - rightClip);
    }

    // Add padding so scrolling doesn't show blank edges
    const pad = 100; // CSS pixels of padding on each side
    const renderLeft = Math.max(0, visibleLeft - pad);
    const renderRight = Math.min(contentWidth, visibleLeft + visibleWidthCSS + pad);
    const renderWidthCSS = renderRight - renderLeft;

    const backingWidth = Math.round(renderWidthCSS * dpr);
    const backingHeight = Math.round(canvasHeight * dpr);
    if (backingWidth <= 0) return;

    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;

    // Position the canvas at the render offset within the clip
    canvas.style.width = `${renderWidthCSS}px`;
    canvas.style.left = `${renderLeft}px`;
    canvas.style.position = 'absolute';

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, backingWidth, backingHeight);

    // Tell drawWaveform about the visible window:
    // We shift audioOffset so only the visible portion is rendered.
    const clipFractionStart = renderLeft / contentWidth;
    const clipFractionWidth = renderWidthCSS / contentWidth;
    const visibleAudioStart = audioOffset + clipFractionStart * clipDuration;
    const visibleClipDuration = clipFractionWidth * clipDuration;

    drawWaveform(ctx, {
      peaks: activePeaks,
      audioDuration,
      audioOffset: visibleAudioStart,
      clipDuration: visibleClipDuration,
      contentOffset: 0,
      timeStretchRate,
      stretchMode,
      width: backingWidth,
      height: backingHeight,
      color,
      opacity: 1,
      trackVolume,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiResPeaks, peaks, audioDuration, audioOffset, clipDuration, contentOffset, timeStretchRate, stretchMode, contentWidth, color, trackVolume, resizeTick, scrollX, viewportWidth, trackListWidth]);

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
          height: '100%',
          imageRendering: 'pixelated',
        }}
      />
    </div>
  );
}
