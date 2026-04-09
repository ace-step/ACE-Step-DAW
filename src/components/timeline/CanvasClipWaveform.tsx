import { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
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

/** Max CSS-pixel width per canvas chunk. Keeps backing stores small. */
const CHUNK_CSS_WIDTH = 1000;

// AudioBuffer cache
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
 * Chunked canvas waveform renderer.
 *
 * Splits the clip into multiple small canvas elements (1000px CSS each).
 * Each chunk has a backing store of exactly chunk_width × DPR — guaranteeing
 * 1:1 device-pixel mapping with zero stretching. Only visible chunks need
 * rendering (browser skips offscreen canvases automatically).
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
  width,
  color,
  opacityClassName = 'opacity-90',
  trackVolume = 1,
}: CanvasClipWaveformProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hiResPeaks, setHiResPeaks] = useState<number[] | null>(null);
  const hiResRequestRef = useRef<string | null>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  const contentWidth = Math.max(width, 0);
  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

  // Track container height
  const setRef = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el;
    if (el) {
      const h = el.clientHeight;
      if (h > 0) setContainerHeight(h);
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const rh = entry.contentRect.height;
          if (rh > 0) setContainerHeight(rh);
        }
      });
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, []);

  // High-res peaks from raw audio
  useEffect(() => {
    if (!peaks || !audioKey) return;
    const neededColumns = Math.round(contentWidth * dpr);
    const logicalPeakCount = Math.floor(peaks.length / PEAK_STRIDE);
    if (neededColumns <= logicalPeakCount * 1.2) {
      if (hiResPeaks) setHiResPeaks(null);
      hiResRequestRef.current = null;
      return;
    }
    // Target: one logical peak per device pixel, capped reasonably
    const targetCount = Math.min(65536, Math.max(logicalPeakCount * 2, neededColumns));
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
  }, [audioKey, peaks, contentWidth, dpr, hiResPeaks]);

  const activePeaks = hiResPeaks ?? peaks;
  if (!activePeaks || activePeaks.length === 0 || contentWidth <= 0) {
    return null;
  }

  // Compute chunk layout
  const chunkCount = Math.ceil(contentWidth / CHUNK_CSS_WIDTH);
  const chunks: Array<{ index: number; left: number; cssWidth: number }> = [];
  for (let i = 0; i < chunkCount; i++) {
    const left = i * CHUNK_CSS_WIDTH;
    const cssWidth = Math.min(CHUNK_CSS_WIDTH, contentWidth - left);
    chunks.push({ index: i, left, cssWidth });
  }

  return (
    <div
      ref={setRef}
      className={`absolute inset-0 overflow-hidden ${opacityClassName}`}
    >
      {chunks.map((chunk) => (
        <WaveformChunk
          key={chunk.index}
          left={chunk.left}
          cssWidth={chunk.cssWidth}
          height={containerHeight}
          dpr={dpr}
          peaks={activePeaks}
          audioDuration={audioDuration}
          audioOffset={audioOffset}
          clipDuration={clipDuration}
          contentOffset={contentOffset}
          contentWidth={contentWidth}
          timeStretchRate={timeStretchRate}
          stretchMode={stretchMode}
          color={color}
          trackVolume={trackVolume}
        />
      ))}
    </div>
  );
}

/** A single canvas chunk — draws its portion of the waveform at 1:1 DPR. */
function WaveformChunk({
  left,
  cssWidth,
  height,
  dpr,
  peaks,
  audioDuration,
  audioOffset,
  clipDuration,
  contentOffset,
  contentWidth,
  timeStretchRate,
  stretchMode,
  color,
  trackVolume,
}: {
  left: number;
  cssWidth: number;
  height: number;
  dpr: number;
  peaks: number[];
  audioDuration: number;
  audioOffset: number;
  clipDuration: number;
  contentOffset?: number;
  contentWidth: number;
  timeStretchRate?: number;
  stretchMode?: StretchMode;
  color: string;
  trackVolume: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // useLayoutEffect to draw before browser paint — prevents flicker
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || cssWidth <= 0 || height <= 0) return;

    const backingWidth = Math.round(cssWidth * dpr);
    const backingHeight = Math.round(height * dpr);
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.resetTransform();
    ctx.clearRect(0, 0, backingWidth, backingHeight);
    ctx.imageSmoothingEnabled = false;
    // Scale so we can draw in CSS-pixel coordinates
    ctx.scale(dpr, dpr);

    // Compute what fraction of the clip this chunk covers
    const chunkStartFrac = left / contentWidth;
    const chunkEndFrac = (left + cssWidth) / contentWidth;

    // Map to audio time
    const chunkAudioStart = audioOffset + chunkStartFrac * clipDuration;
    const chunkClipDuration = (chunkEndFrac - chunkStartFrac) * clipDuration;

    drawWaveform(ctx, {
      peaks,
      audioDuration,
      audioOffset: chunkAudioStart,
      clipDuration: chunkClipDuration,
      contentOffset: 0,
      timeStretchRate,
      stretchMode,
      width: cssWidth,
      height,
      color,
      opacity: 1,
      trackVolume,
    });
  }, [peaks, audioDuration, audioOffset, clipDuration, contentOffset, contentWidth, timeStretchRate, stretchMode, cssWidth, height, dpr, color, trackVolume, left]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="canvas-waveform"
      role="img"
      aria-label="Audio waveform"
      style={{
        position: 'absolute',
        left,
        top: 0,
        width: cssWidth,
        height: '100%',
        imageRendering: 'crisp-edges',
      }}
    />
  );
}
