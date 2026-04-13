import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import type { StretchMode } from '../../types/project';
import { drawWaveform, drawMipmapWaveform, type FadeEnvelope } from './waveformRenderer';
import { PEAK_STRIDE, computeWaveformPeaks } from '../../utils/waveformPeaks';
import { loadAudioBlobByKey } from '../../services/audioFileManager';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import {
  queryPeaksSync,
  hasCachedMipmap,
  loadMipmapIntoCache,
  initWaveformWasm,
} from '../../services/waveformMipmapCache';

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
  fadeEnvelope?: FadeEnvelope;
}

// Module-level AudioBuffer cache (LRU, max 20)
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

/** Max CSS width for a single canvas. */
const MAX_SINGLE_CANVAS_CSS = 4000;

// Initialize WASM once at module load (skip in test/SSR environments)
let wasmInitialized = false;
if (typeof globalThis.fetch === 'function' && typeof WebAssembly !== 'undefined') {
  initWaveformWasm().then(() => { wasmInitialized = true; }).catch(() => {});
}

/**
 * DAW-standard waveform component.
 *
 * Rendering priority:
 * 1. Mipmap (Rust WASM, synchronous query) — if available
 * 2. Legacy peaks (JS-computed) — fallback
 *
 * For clips <= 4000px: single canvas with 1:1 DPR.
 * For larger clips: chunked canvases, all mounted.
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
  fadeEnvelope,
}: CanvasClipWaveformProps) {
  const contentWidth = Math.max(width, 0);
  const [mipmapReady, setMipmapReady] = useState(false);

  // Try to load mipmap into sync cache (one-time async, then sync queries)
  useEffect(() => {
    if (!audioKey) { setMipmapReady(false); return; }
    if (hasCachedMipmap(audioKey)) { setMipmapReady(true); return; }
    let cancelled = false;
    void (async () => {
      const loaded = await loadMipmapIntoCache(audioKey);
      if (!cancelled) setMipmapReady(loaded);
    })();
    return () => { cancelled = true; };
  }, [audioKey]);

  if ((!peaks || peaks.length === 0) && !mipmapReady) return null;
  if (contentWidth <= 0) return null;

  // For small clips, single canvas
  if (contentWidth <= MAX_SINGLE_CANVAS_CSS) {
    return (
      <div className={`absolute inset-0 overflow-hidden ${opacityClassName}`}>
        <WaveformCanvas
          peaks={peaks ?? []}
          audioKey={audioKey}
          audioDuration={audioDuration}
          audioOffset={audioOffset}
          clipDuration={clipDuration}
          contentOffset={contentOffset}
          timeStretchRate={timeStretchRate}
          stretchMode={stretchMode}
          width={contentWidth}
          color={color}
          trackVolume={trackVolume}
          mipmapReady={mipmapReady}
          fadeEnvelope={fadeEnvelope}
        />
      </div>
    );
  }

  // For large clips, chunked rendering
  return (
    <div className={`absolute inset-0 overflow-hidden ${opacityClassName}`}>
      <ChunkedWaveform
        peaks={peaks ?? []}
        audioKey={audioKey}
        audioDuration={audioDuration}
        audioOffset={audioOffset}
        clipDuration={clipDuration}
        contentOffset={contentOffset}
        timeStretchRate={timeStretchRate}
        stretchMode={stretchMode}
        totalWidth={contentWidth}
        color={color}
        trackVolume={trackVolume}
        mipmapReady={mipmapReady}
        fadeEnvelope={fadeEnvelope}
      />
    </div>
  );
}

// ---- Single canvas (small clips) ----

interface WaveformCanvasProps {
  peaks: number[];
  audioKey: string | null;
  audioDuration: number;
  audioOffset: number;
  clipDuration: number;
  contentOffset?: number;
  timeStretchRate?: number;
  stretchMode?: StretchMode;
  width: number;
  color: string;
  trackVolume: number;
  mipmapReady: boolean;
  fadeEnvelope?: FadeEnvelope;
}

function WaveformCanvas({
  peaks, audioKey, audioDuration, audioOffset, clipDuration,
  contentOffset, timeStretchRate, stretchMode,
  width, color, trackVolume, mipmapReady, fadeEnvelope,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const [resizeTick, setResizeTick] = useState(0);

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

  // Memoize peak data separately from the draw effect. The WASM query allocates
  // a ~100KB Float32Array per call and crosses the JS↔WASM boundary, so we must
  // NOT re-run it when only the fade envelope changes (during fade drag the
  // audio params are constant). The draw effect below takes the cached peakData
  // and only re-runs the cheap canvas drawing on fade changes.
  const mipmapPeakInfo = useMemo(() => {
    if (!mipmapReady || !audioKey || width <= 0) return null;
    const sampleRate = audioBufferCache.get(audioKey)?.sampleRate ?? 44100;
    const isStretched = timeStretchRate !== undefined && timeStretchRate !== 1 && stretchMode && stretchMode !== 'repitch';
    const queryDur = isStretched ? audioDuration : Math.min(audioDuration, clipDuration);
    const drawWidth = isStretched ? width : (clipDuration > 0 ? width * (queryDur / clipDuration) : width);
    const startSample = Math.round(audioOffset * sampleRate);
    const endSample = Math.round((audioOffset + queryDur) * sampleRate);
    const columns = Math.min(4096, Math.max(1, Math.round(drawWidth)));
    const peakData = queryPeaksSync(audioKey, startSample, endSample, columns);
    if (!peakData || peakData.length === 0) return null;
    return { peakData, drawWidth };
  }, [mipmapReady, audioKey, audioDuration, audioOffset, clipDuration, timeStretchRate, stretchMode, width]);

  // Draw — synchronous, no async in this effect. Uses the memoized peakData
  // so fade-only updates don't allocate or re-cross WASM.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    const h = canvas.clientHeight;
    if (h <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(width * dpr);
    const bh = Math.round(h * dpr);
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    ctx.resetTransform();
    ctx.clearRect(0, 0, bw, bh);
    ctx.scale(dpr, dpr);

    if (mipmapPeakInfo) {
      drawMipmapWaveform(ctx, {
        peakData: mipmapPeakInfo.peakData,
        leftPx: 0,
        width: mipmapPeakInfo.drawWidth,
        height: h,
        color,
        opacity: 1,
        trackVolume,
        fadeEnvelope,
      });
      return;
    }

    // Fallback: legacy peaks
    drawWaveform(ctx, {
      peaks, audioDuration, audioOffset, clipDuration,
      contentOffset, timeStretchRate, stretchMode,
      width, height: h, color, opacity: 1, trackVolume, fadeEnvelope,
    });
  }, [mipmapPeakInfo, peaks, audioDuration, audioOffset, clipDuration, contentOffset, timeStretchRate, stretchMode, width, color, trackVolume, resizeTick, fadeEnvelope]);

  return (
    <canvas
      ref={setCanvasRef}
      data-testid="canvas-waveform"
      role="img"
      aria-label="Audio waveform"
      style={{ width, height: '100%' }}
    />
  );
}

// ---- Chunked waveform (large clips) ----

const CHUNK_CSS_WIDTH = 2000;

interface ChunkedWaveformProps {
  peaks: number[];
  audioKey: string | null;
  audioDuration: number;
  audioOffset: number;
  clipDuration: number;
  contentOffset?: number;
  timeStretchRate?: number;
  stretchMode?: StretchMode;
  totalWidth: number;
  color: string;
  trackVolume: number;
  mipmapReady: boolean;
  fadeEnvelope?: FadeEnvelope;
}

function ChunkedWaveform({
  peaks, audioKey, audioDuration, audioOffset, clipDuration,
  contentOffset, timeStretchRate, stretchMode,
  totalWidth, color, trackVolume, mipmapReady, fadeEnvelope,
}: ChunkedWaveformProps) {
  const totalChunks = Math.ceil(totalWidth / CHUNK_CSS_WIDTH);

  // Query mipmap — when stretched, fill full width; otherwise clamp to audioDuration
  const isStretched = timeStretchRate !== undefined && timeStretchRate !== 1 && stretchMode && stretchMode !== 'repitch';
  const queryDur = isStretched ? audioDuration : Math.min(audioDuration, clipDuration);
  const drawWidth = isStretched ? totalWidth : (clipDuration > 0 ? totalWidth * (queryDur / clipDuration) : totalWidth);
  const mipmapColumns = Math.min(4096, Math.max(1, Math.round(drawWidth)));
  const fullMipmapData = useMemo(() => {
    if (!mipmapReady || !audioKey) return null;
    const sampleRate = audioBufferCache.get(audioKey)?.sampleRate ?? 44100;
    const startSample = Math.round(audioOffset * sampleRate);
    const endSample = Math.round((audioOffset + queryDur) * sampleRate);
    return queryPeaksSync(audioKey, startSample, endSample, mipmapColumns);
  }, [mipmapReady, audioKey, audioOffset, queryDur, mipmapColumns]);

  const chunks = useMemo(() => {
    const result: Array<{ idx: number; left: number; w: number }> = [];
    for (let i = 0; i < totalChunks; i++) {
      const left = i * CHUNK_CSS_WIDTH;
      const w = Math.min(CHUNK_CSS_WIDTH, totalWidth - left);
      if (w > 0) result.push({ idx: i, left, w });
    }
    return result;
  }, [totalChunks, totalWidth]);

  return (
    <div style={{ position: 'relative', width: totalWidth, height: '100%' }}>
      {chunks.map(({ idx, left, w }) => (
        <ChunkCanvas
          key={idx}
          peaks={peaks}
          audioKey={audioKey}
          audioDuration={audioDuration}
          audioOffset={audioOffset}
          clipDuration={clipDuration}
          contentOffset={contentOffset}
          timeStretchRate={timeStretchRate}
          stretchMode={stretchMode}
          totalWidth={totalWidth}
          chunkLeft={left}
          chunkWidth={w}
          color={color}
          trackVolume={trackVolume}
          fullMipmapData={fullMipmapData}
          fadeEnvelope={fadeEnvelope}
        />
      ))}
    </div>
  );
}

// ---- Individual chunk canvas ----

interface ChunkCanvasProps {
  peaks: number[];
  audioKey: string | null;
  audioDuration: number;
  audioOffset: number;
  clipDuration: number;
  contentOffset?: number;
  timeStretchRate?: number;
  stretchMode?: StretchMode;
  totalWidth: number;
  chunkLeft: number;
  chunkWidth: number;
  color: string;
  trackVolume: number;
  /** Full clip mipmap data (stride-6, totalWidth columns), queried at parent level. */
  fullMipmapData: Float32Array | null;
  fadeEnvelope?: FadeEnvelope;
}

function ChunkCanvas({
  peaks, audioKey, audioDuration, audioOffset, clipDuration,
  contentOffset, timeStretchRate, stretchMode,
  totalWidth, chunkLeft, chunkWidth, color, trackVolume, fullMipmapData, fadeEnvelope,
}: ChunkCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || chunkWidth <= 0) return;
    const h = canvas.clientHeight;
    if (h <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(chunkWidth * dpr);
    const bh = Math.round(h * dpr);
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    ctx.resetTransform();
    ctx.clearRect(0, 0, bw, bh);
    ctx.scale(dpr, dpr);

    // Each chunk draws a sub-range of the clip; the envelope still indexes
    // into the full-clip pixel space, so pass the chunk's left offset.
    const chunkEnvelope: FadeEnvelope | undefined = fadeEnvelope
      ? { ...fadeEnvelope, offsetPx: chunkLeft }
      : undefined;

    // Use full mipmap data — slice this chunk's columns from the parent array
    if (fullMipmapData && fullMipmapData.length > 0) {
      const STRIDE = 6;
      const totalColumns = Math.floor(fullMipmapData.length / STRIDE);
      // Map chunk pixel range to column range in the full data
      const colStart = Math.floor((chunkLeft / totalWidth) * totalColumns);
      const colEnd = Math.min(totalColumns, Math.ceil(((chunkLeft + chunkWidth) / totalWidth) * totalColumns));
      const sliceLen = colEnd - colStart;
      if (sliceLen > 0) {
        const slicedData = fullMipmapData.subarray(colStart * STRIDE, colEnd * STRIDE);
        drawMipmapWaveform(ctx, {
          peakData: slicedData, leftPx: 0, width: chunkWidth, height: h, color, opacity: 1, trackVolume, fadeEnvelope: chunkEnvelope,
        });
        return;
      }
    }

    // Fallback: translate and draw from legacy peaks
    ctx.translate(-chunkLeft, 0);
    drawWaveform(ctx, {
      peaks, audioDuration, audioOffset, clipDuration,
      contentOffset, timeStretchRate, stretchMode,
      width: totalWidth, height: h, color, opacity: 1, trackVolume,
      fadeEnvelope, // legacy path uses absolute coordinates so no offset needed
    });
  }, [peaks, audioKey, audioDuration, audioOffset, clipDuration, contentOffset, timeStretchRate, stretchMode, totalWidth, chunkLeft, chunkWidth, color, trackVolume, fullMipmapData, fadeEnvelope]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="canvas-waveform"
      role="img"
      aria-label="Audio waveform chunk"
      style={{
        position: 'absolute',
        left: chunkLeft,
        top: 0,
        width: chunkWidth,
        height: '100%',
      }}
    />
  );
}
