import type { MidiClipData, StretchMode } from '../../types/project';
import { getClipSourceSpan, getClipWaveformLayout } from '../../utils/clipAudio';
import { PEAK_STRIDE } from '../../utils/waveformPeaks';

interface ClipWaveformProps {
  peaks: number[] | null;
  audioDuration: number;
  audioOffset: number;
  clipDuration: number;
  contentOffset?: number;
  timeStretchRate?: number;
  stretchMode?: StretchMode;
  width: number;
  color: string;
  opacityClassName?: string;
  /** Track volume (0..1). Scales the waveform visually to reflect actual output level. */
  trackVolume?: number;
}

export function ClipWaveform({
  peaks,
  audioDuration,
  audioOffset,
  clipDuration,
  contentOffset,
  timeStretchRate,
  stretchMode,
  width,
  color,
  opacityClassName = 'opacity-60',
  trackVolume = 1,
}: ClipWaveformProps) {
  const contentWidth = Math.max(width, 0);
  const clipWindow = {
    startTime: 0,
    duration: clipDuration,
    audioDuration,
    audioOffset,
    contentOffset,
    timeStretchRate,
    stretchMode,
  };
  const waveformLayout = getClipWaveformLayout(clipWindow, contentWidth);

  if (!peaks || peaks.length === 0 || contentWidth <= 0 || waveformLayout.widthPx <= 0) {
    return null;
  }

  const logicalPeakCount = Math.floor(peaks.length / PEAK_STRIDE);
  if (logicalPeakCount === 0) {
    // Legacy mono fallback: old peaks with no stride structure
    return null;
  }

  const peakSlice = getVisiblePeakSlice(logicalPeakCount, audioDuration, audioOffset, getClipSourceSpan(clipWindow));
  if (peakSlice.numBars === 0) return null;

  const columnCount = Math.max(1, Math.floor(waveformLayout.widthPx));
  const columnWidth = waveformLayout.widthPx / columnCount;

  // Mono merged display: single waveform centered at y=50, using full height
  const scaledAmplitude = 44 * Math.min(1, trackVolume);

  const monoPath = buildMonoMergedPath(
    peaks, peakSlice, columnCount, columnWidth, waveformLayout.leftPx,
    50, scaledAmplitude,
  );
  const monoPeakLine = buildMonoMergedEnvelopeLine(
    peaks, peakSlice, columnCount, columnWidth, waveformLayout.leftPx,
    50, scaledAmplitude,
  );

  return (
    <div className="absolute inset-0 flex items-center overflow-hidden">
      <svg
        width={contentWidth}
        height="100%"
        viewBox={`0 0 ${contentWidth} 100`}
        preserveAspectRatio="none"
        className={opacityClassName}
      >
        <path d={monoPath} fill={color} fillOpacity={0.85} data-testid="waveform-mono" />
        <path d={monoPeakLine} fill="none" stroke={color} strokeOpacity={1} strokeWidth={1.0} data-testid="waveform-mono-peak" />
      </svg>
    </div>
  );
}

/**
 * Build mono merged SVG path: max(L,R) for upper, min(L,R) for lower.
 */
function buildMonoMergedPath(
  peaks: number[],
  peakSlice: { startPeakIdx: number; numBars: number },
  columnCount: number,
  columnWidth: number,
  leftPx: number,
  centerY: number,
  maxAmplitude: number,
): string {
  const upperPoints: string[] = [];
  const lowerPoints: string[] = [];

  for (let i = 0; i < columnCount; i++) {
    const x = leftPx + (i + 0.5) * columnWidth;
    const l = getMinMaxForColumn(peaks, peakSlice, i, columnCount, 0);
    const r = getMinMaxForColumn(peaks, peakSlice, i, columnCount, 2);
    const maxVal = Math.max(l.max, r.max);
    const minVal = Math.min(l.min, r.min);
    upperPoints.push(`${x} ${centerY - maxVal * maxAmplitude}`);
    lowerPoints.push(`${x} ${centerY - minVal * maxAmplitude}`);
  }

  return `M ${upperPoints[0]} L ${upperPoints.join(' L ')} L ${lowerPoints.reverse().join(' L ')} Z`;
}

/**
 * Build mono merged peak envelope line (positive peaks only).
 */
function buildMonoMergedEnvelopeLine(
  peaks: number[],
  peakSlice: { startPeakIdx: number; numBars: number },
  columnCount: number,
  columnWidth: number,
  leftPx: number,
  centerY: number,
  maxAmplitude: number,
): string {
  const points: string[] = [];
  for (let i = 0; i < columnCount; i++) {
    const x = leftPx + (i + 0.5) * columnWidth;
    const l = getMinMaxForColumn(peaks, peakSlice, i, columnCount, 0);
    const r = getMinMaxForColumn(peaks, peakSlice, i, columnCount, 2);
    const maxVal = Math.max(l.max, r.max);
    points.push(`${x} ${centerY - maxVal * maxAmplitude}`);
  }
  if (points.length === 0) return '';
  return `M ${points.join(' L ')}`;
}

function getVisiblePeakSlice(
  logicalPeakCount: number,
  audioDuration: number,
  audioOffset: number,
  sourceSpan: number,
) {
  if (logicalPeakCount === 0 || audioDuration <= 0) {
    return { startPeakIdx: 0, numBars: 0 };
  }

  const startPeakIdx = Math.floor((audioOffset / audioDuration) * logicalPeakCount);
  const visibleAudioSec = Math.min(sourceSpan, Math.max(0, audioDuration - audioOffset));
  const endPeakIdx = Math.min(
    Math.ceil(((audioOffset + visibleAudioSec) / audioDuration) * logicalPeakCount),
    logicalPeakCount,
  );

  return {
    startPeakIdx,
    numBars: Math.max(0, endPeakIdx - startPeakIdx),
  };
}

/**
 * For a given display column, find the min and max sample values across
 * the corresponding peak range for a specific channel.
 */
function getMinMaxForColumn(
  peaks: number[],
  peakSlice: { startPeakIdx: number; numBars: number },
  columnIndex: number,
  columnCount: number,
  channelOffset: number, // 0 for L, 2 for R
): { max: number; min: number } {
  const start = peakSlice.startPeakIdx + Math.floor((columnIndex / columnCount) * peakSlice.numBars);
  const end = peakSlice.startPeakIdx + Math.ceil(((columnIndex + 1) / columnCount) * peakSlice.numBars);
  let max = 0;
  let min = 0;

  for (let i = start; i < end; i++) {
    const idx = i * PEAK_STRIDE + channelOffset;
    const peakMax = peaks[idx] ?? 0;
    const peakMin = peaks[idx + 1] ?? 0;
    if (peakMax > max) max = peakMax;
    if (peakMin < min) min = peakMin;
  }

  return { max, min };
}

interface ClipMidiThumbnailProps {
  midiData: MidiClipData;
  width: number;
  duration: number;
  bpm: number;
  color: string;
}

export function ClipMidiThumbnail({ midiData, width, duration, bpm, color }: ClipMidiThumbnailProps) {
  if (midiData.notes.length === 0) {
    return null;
  }

  const secPerBeat = 60 / bpm;
  const pitches = midiData.notes.map((note) => note.pitch);
  const minPitch = Math.min(...pitches);
  const maxPitch = Math.max(...pitches);
  const range = Math.max(maxPitch - minPitch, 12);
  const pad = 2;

  // Zoom-adaptive density: when clip is narrow, skip notes that would overlap
  // to avoid visual noise. At wider widths, show all notes.
  const maxNotes = Math.max(20, Math.floor(width / 2));
  const notes = midiData.notes.length > maxNotes
    ? midiData.notes.filter((_, i) => i % Math.ceil(midiData.notes.length / maxNotes) === 0)
    : midiData.notes;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ top: 14 }}>
      <svg width="100%" height="100%" preserveAspectRatio="none" viewBox={`0 0 ${width} 100`}>
        {notes.map((note, index) => {
          const x = (note.startBeat * secPerBeat / duration) * width;
          const noteWidth = Math.max((note.durationBeats * secPerBeat / duration) * width, 1);
          const y = 100 - ((note.pitch - minPitch + pad) / (range + pad * 2)) * 100;
          const height = Math.max(100 / (range + pad * 2), 2);

          return <rect key={index} x={x} y={y} width={noteWidth} height={height} fill={color} opacity={0.7} rx={0.5} />;
        })}
      </svg>
    </div>
  );
}
