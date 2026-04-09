import { useRef, useLayoutEffect, useEffect, useState, useCallback, useMemo } from 'react';
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
  width: number;
  color: string;
  opacityClassName?: string;
  trackVolume?: number;
}

/** CSS pixels per canvas chunk. 2000px × 2.2 DPR = 4400 backing — well under 16384. */
const CHUNK_WIDTH = 2000;

// AudioBuffer LRU cache
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
 * Compute which chunk indices overlap the visible viewport.
 * Uses 1.5× overscan on each side to pre-render chunks before they scroll in.
 */
function getVisibleChunkIndices(
  clipLeftInTimeline: number,
  totalWidth: number,
  scrollX: number,
  viewportWidth: number,
): number[] {
  const totalChunks = Math.ceil(totalWidth / CHUNK_WIDTH);
  if (viewportWidth <= 0 || totalChunks <= 0) {
    // No viewport info (test env) — return all chunks (but capped)
    return Array.from({ length: Math.min(totalChunks, 8) }, (_, i) => i);
  }

  const overscan = viewportWidth * 1.5;
  const visStart = scrollX - overscan;
  const visEnd = scrollX + viewportWidth + overscan;

  const indices: number[] = [];
  for (let i = 0; i < totalChunks; i++) {
    const chunkLeft = clipLeftInTimeline + i * CHUNK_WIDTH;
    const chunkRight = chunkLeft + Math.min(CHUNK_WIDTH, totalWidth - i * CHUNK_WIDTH);
    if (chunkRight > visStart && chunkLeft < visEnd) {
      indices.push(i);
    }
  }
  return indices;
}

/**
 * Chunked canvas waveform — only visible chunks are mounted.
 *
 * Each chunk: 2000 CSS px wide → ~4400 backing px at 2.2 DPR.
 * On a 1920px viewport with 1.5× overscan: ~4-6 chunks mounted.
 * Each chunk has 1:1 device-pixel mapping — zero stretch, zero blur.
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
  width: fullWidth,
  color,
  opacityClassName = 'opacity-90',
  trackVolume = 1,
}: CanvasClipWaveformProps) {
  const [hiResPeaks, setHiResPeaks] = useState<number[] | null>(null);
  const hiResReqRef = useRef<string | null>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const contentWidth = Math.max(fullWidth, 0);
  const scrollX = useUIStore((s) => s.scrollX);
  const viewportWidth = useUIStore((s) => s.timelineViewportWidth);
  const trackListWidth = useUIStore((s) => s.trackListWidth);

  // Track container height via ResizeObserver
  const observerRef = useRef<ResizeObserver | null>(null);
  const setRef = useCallback((el: HTMLDivElement | null) => {
    if (observerRef.current) { observerRef.current.disconnect(); observerRef.current = null; }
    containerRef.current = el;
    if (el) {
      const h = el.clientHeight;
      if (h > 0) setContainerHeight(h);
      const ro = new ResizeObserver((entries) => {
        for (const e of entries) { if (e.contentRect.height > 0) setContainerHeight(e.contentRect.height); }
      });
      ro.observe(el);
      observerRef.current = ro;
    }
  }, []);
  useEffect(() => () => { observerRef.current?.disconnect(); }, []);

  // High-res peaks when zoomed in
  useEffect(() => {
    if (!peaks || !audioKey) return;
    const dpr = window.devicePixelRatio || 1;
    // Per-chunk backing width is the resolution target
    const chunkBacking = Math.round(CHUNK_WIDTH * dpr);
    const logicalPeakCount = Math.floor(peaks.length / PEAK_STRIDE);
    // If pre-computed peaks give at least 1 peak per chunk-backing-pixel, keep them
    const peaksPerChunkPx = logicalPeakCount / (contentWidth / CHUNK_WIDTH * chunkBacking / chunkBacking);
    if (logicalPeakCount >= contentWidth) {
      if (hiResPeaks) setHiResPeaks(null);
      hiResReqRef.current = null;
      return;
    }
    // Target: 1 logical peak per CSS pixel (chunks handle DPR scaling)
    const target = Math.min(65536, Math.max(logicalPeakCount * 2, Math.round(contentWidth)));
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
  }, [audioKey, peaks, contentWidth, hiResPeaks]);

  const activePeaks = hiResPeaks ?? peaks;
  if (!activePeaks || activePeaks.length === 0 || contentWidth <= 0) return null;

  // Compute clip's left position in timeline from the DOM
  const clipLeft = containerRef.current
    ? containerRef.current.getBoundingClientRect().left
      - (containerRef.current.closest('#arrangement-timeline-scroll')?.getBoundingClientRect().left ?? 0)
      + (containerRef.current.closest('#arrangement-timeline-scroll')?.scrollLeft ?? 0)
      - trackListWidth
    : 0;

  const visibleIndices = getVisibleChunkIndices(clipLeft, contentWidth, scrollX, viewportWidth);

  // Stable key for draw version (skip redraws when data hasn't changed)
  const drawVersion = `${activePeaks.length}-${audioDuration}-${audioOffset}-${clipDuration}-${contentOffset ?? 0}-${timeStretchRate ?? 1}-${stretchMode ?? ''}-${color}-${trackVolume}-${containerHeight}`;

  return (
    <div ref={setRef} className={`absolute inset-0 overflow-hidden ${opacityClassName}`}>
      {visibleIndices.map((i) => {
        const chunkLeft = i * CHUNK_WIDTH;
        const chunkCSSWidth = Math.min(CHUNK_WIDTH, contentWidth - chunkLeft);
        return (
          <WaveformChunk
            key={i}
            chunkIndex={i}
            left={chunkLeft}
            cssWidth={chunkCSSWidth}
            height={containerHeight}
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
            drawVersion={drawVersion}
          />
        );
      })}
    </div>
  );
}

/** A single canvas chunk. Draws its slice of the waveform at 1:1 DPR. */
function WaveformChunk({
  chunkIndex,
  left,
  cssWidth,
  height,
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
  drawVersion,
}: {
  chunkIndex: number;
  left: number;
  cssWidth: number;
  height: number;
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
  drawVersion: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || cssWidth <= 0 || height <= 0) return;

    // Skip if already drawn with same params
    const ver = `${drawVersion}-${chunkIndex}`;
    if (canvas.dataset.drawVersion === ver) return;

    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(cssWidth * dpr);
    const bh = Math.round(height * dpr);
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.resetTransform();
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, bw, bh);
    ctx.scale(dpr, dpr);

    // Map this chunk's pixel range to the clip's audio time range
    const fracStart = left / contentWidth;
    const fracEnd = (left + cssWidth) / contentWidth;
    const chunkAudioOffset = audioOffset + fracStart * clipDuration;
    const chunkClipDuration = (fracEnd - fracStart) * clipDuration;

    drawWaveform(ctx, {
      peaks,
      audioDuration,
      audioOffset: chunkAudioOffset,
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

    canvas.dataset.drawVersion = ver;
  }, [peaks, audioDuration, audioOffset, clipDuration, contentOffset, contentWidth, timeStretchRate, stretchMode, cssWidth, height, color, trackVolume, left, drawVersion, chunkIndex]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="canvas-waveform"
      data-index={chunkIndex}
      role="img"
      aria-label="Audio waveform"
      style={{
        position: 'absolute',
        left,
        top: 0,
        width: cssWidth,
        height: '100%',
      }}
    />
  );
}
