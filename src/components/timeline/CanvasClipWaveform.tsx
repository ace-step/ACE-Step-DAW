import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
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

/** Max CSS width for a single canvas. Below browser limits even at 3× DPR. */
const MAX_SINGLE_CANVAS_CSS = 4000;

/**
 * DAW-standard waveform component.
 *
 * For clips <= 4000px CSS width: single canvas with 1:1 DPR backing store.
 * For larger clips: chunked canvases, only visible chunks mounted.
 * Each chunk has its own canvas with exact 1:1 device-pixel backing store.
 *
 * Same architecture as wavesurfer.js (max 8000px chunks) and peaks.js.
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
  const contentWidth = Math.max(width, 0);
  const [hiResPeaks, setHiResPeaks] = useState<number[] | null>(null);
  const hiResReqRef = useRef<string | null>(null);

  // Compute hi-res peaks when pre-computed peaks are insufficient
  useEffect(() => {
    if (!peaks || !audioKey || contentWidth <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    // Target: enough peaks for the clip at full DPR, capped at 16384
    const targetPeaks = Math.min(Math.round(contentWidth * dpr), 16384);
    const logicalPeakCount = Math.floor(peaks.length / PEAK_STRIDE);
    if (logicalPeakCount >= targetPeaks) {
      if (hiResPeaks) setHiResPeaks(null);
      hiResReqRef.current = null;
      return;
    }
    const reqKey = `${audioKey}:${targetPeaks}`;
    if (hiResReqRef.current === reqKey && hiResPeaks) return;
    let cancelled = false;
    hiResReqRef.current = reqKey;
    void (async () => {
      const buf = await getAudioBuffer(audioKey);
      if (cancelled || !buf) return;
      const p = computeWaveformPeaks(buf, targetPeaks);
      if (!cancelled) setHiResPeaks(p);
    })();
    return () => { cancelled = true; };
  }, [audioKey, peaks, contentWidth, hiResPeaks]);

  const activePeaks = hiResPeaks ?? peaks;
  if (!activePeaks || activePeaks.length === 0 || contentWidth <= 0) return null;

  // For small clips, single canvas — fast path
  if (contentWidth <= MAX_SINGLE_CANVAS_CSS) {
    return (
      <div className={`absolute inset-0 overflow-hidden ${opacityClassName}`}>
        <WaveformCanvas
          peaks={activePeaks}
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
        />
      </div>
    );
  }

  // For large clips, chunked rendering
  return (
    <div className={`absolute inset-0 overflow-hidden ${opacityClassName}`}>
      <ChunkedWaveform
        peaks={activePeaks}
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
}

function WaveformCanvas({
  peaks, audioKey, audioDuration, audioOffset, clipDuration,
  contentOffset, timeStretchRate, stretchMode,
  width, color, trackVolume,
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

    const cachedBuffer = audioKey ? audioBufferCache.get(audioKey) : null;
    const rawSamples = cachedBuffer ? {
      left: cachedBuffer.getChannelData(0),
      right: cachedBuffer.numberOfChannels >= 2 ? cachedBuffer.getChannelData(1) : cachedBuffer.getChannelData(0),
      sampleRate: cachedBuffer.sampleRate,
    } : null;

    drawWaveform(ctx, {
      peaks, audioDuration, audioOffset, clipDuration,
      contentOffset, timeStretchRate, stretchMode,
      width, height: h, color, opacity: 1, trackVolume, rawSamples,
    });
  }, [peaks, audioKey, audioDuration, audioOffset, clipDuration, contentOffset, timeStretchRate, stretchMode, width, color, trackVolume, resizeTick]);

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
}

function ChunkedWaveform({
  peaks, audioKey, audioDuration, audioOffset, clipDuration,
  contentOffset, timeStretchRate, stretchMode,
  totalWidth, color, trackVolume,
}: Omit<ChunkedWaveformProps, 'scrollX'>) {
  const totalChunks = Math.ceil(totalWidth / CHUNK_CSS_WIDTH);

  // Mount ALL chunks — typically 10-50 lightweight canvas elements.
  // No viewport calculation needed, no DOM measurement, no drift bugs.
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
}

function ChunkCanvas({
  peaks, audioKey, audioDuration, audioOffset, clipDuration,
  contentOffset, timeStretchRate, stretchMode,
  totalWidth, chunkLeft, chunkWidth, color, trackVolume,
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

    // Translate so the chunk draws its portion of the full clip
    ctx.translate(-chunkLeft, 0);

    const cachedBuffer = audioKey ? audioBufferCache.get(audioKey) : null;
    const rawSamples = cachedBuffer ? {
      left: cachedBuffer.getChannelData(0),
      right: cachedBuffer.numberOfChannels >= 2 ? cachedBuffer.getChannelData(1) : cachedBuffer.getChannelData(0),
      sampleRate: cachedBuffer.sampleRate,
    } : null;

    drawWaveform(ctx, {
      peaks, audioDuration, audioOffset, clipDuration,
      contentOffset, timeStretchRate, stretchMode,
      width: totalWidth, height: h, color, opacity: 1, trackVolume, rawSamples,
    });
  }, [peaks, audioKey, audioDuration, audioOffset, clipDuration, contentOffset, timeStretchRate, stretchMode, totalWidth, chunkLeft, chunkWidth, color, trackVolume]);

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
