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

  // Each channel occupies its own vertical half.
  // Left channel: y = 0..50, center at y = 25
  // Right channel: y = 50..100, center at y = 75
  // Scale maxAmplitude by track volume so waveform visually reflects output level
  const scaledAmplitude = 23 * Math.min(1, trackVolume);

  const leftPath = buildChannelPath(
    peaks, peakSlice, columnCount, columnWidth, waveformLayout.leftPx,
    0, // channelOffset in stride: 0 = Lmax, 1 = Lmin
    25, // centerY for left channel
    scaledAmplitude,
  );
  const rightPath = buildChannelPath(
    peaks, peakSlice, columnCount, columnWidth, waveformLayout.leftPx,
    2, // channelOffset in stride: 2 = Rmax, 3 = Rmin
    75, // centerY for right channel
    scaledAmplitude,
  );

  // Peak envelope lines — brighter outline on top of the filled waveform
  const leftPeakLine = buildPeakEnvelopeLine(
    peaks, peakSlice, columnCount, columnWidth, waveformLayout.leftPx,
    0, 25, scaledAmplitude,
  );
  const rightPeakLine = buildPeakEnvelopeLine(
    peaks, peakSlice, columnCount, columnWidth, waveformLayout.leftPx,
    2, 75, scaledAmplitude,
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
        {/* Thin center divider between channels */}
        <line
          x1={waveformLayout.leftPx}
          y1={50}
          x2={waveformLayout.leftPx + waveformLayout.widthPx}
          y2={50}
          stroke={color}
          strokeOpacity={0.2}
          strokeWidth={0.5}
        />
        {/* Filled waveform shapes */}
        <path d={leftPath} fill={color} fillOpacity={0.6} data-testid="waveform-left-channel" />
        <path d={rightPath} fill={color} fillOpacity={0.6} data-testid="waveform-right-channel" />
        {/* Peak envelope highlight lines — brighter outline on top */}
        <path d={leftPeakLine} fill="none" stroke={color} strokeOpacity={1} strokeWidth={0.8} data-testid="waveform-left-peak" />
        <path d={rightPeakLine} fill="none" stroke={color} strokeOpacity={1} strokeWidth={0.8} data-testid="waveform-right-peak" />
      </svg>
    </div>
  );
}

/**
 * Build an SVG path for one channel's waveform.
 * Draws the positive envelope (max) left-to-right, then negative envelope (min) right-to-left,
 * creating a filled shape around the channel's center line.
 */
function buildChannelPath(
  peaks: number[],
  peakSlice: { startPeakIdx: number; numBars: number },
  columnCount: number,
  columnWidth: number,
  leftPx: number,
  channelOffset: number, // 0 for left (Lmax at +0, Lmin at +1), 2 for right (Rmax at +2, Rmin at +3)
  centerY: number,
  maxAmplitude: number,
): string {
  // Upper contour (max values, positive peaks going upward from center)
  const upperPoints: string[] = [];
  // Lower contour (min values, negative peaks going downward from center)
  const lowerPoints: string[] = [];

  for (let i = 0; i < columnCount; i++) {
    const x = leftPx + (i + 0.5) * columnWidth;
    const { max, min } = getMinMaxForColumn(peaks, peakSlice, i, columnCount, channelOffset);
    // max >= 0, maps upward from center; min <= 0, maps downward from center
    const yTop = centerY - max * maxAmplitude;
    const yBottom = centerY - min * maxAmplitude; // min is negative, so this goes below center
    upperPoints.push(`${x} ${yTop}`);
    lowerPoints.push(`${x} ${yBottom}`);
  }

  // Build closed path: upper left-to-right, then lower right-to-left
  return `M ${upperPoints[0]} L ${upperPoints.join(' L ')} L ${lowerPoints.reverse().join(' L ')} Z`;
}

/**
 * Build an SVG path for the peak envelope line (positive peaks only).
 * This draws a single polyline along the top of the waveform for a brighter highlight.
 */
function buildPeakEnvelopeLine(
  peaks: number[],
  peakSlice: { startPeakIdx: number; numBars: number },
  columnCount: number,
  columnWidth: number,
  leftPx: number,
  channelOffset: number,
  centerY: number,
  maxAmplitude: number,
): string {
  const points: string[] = [];
  for (let i = 0; i < columnCount; i++) {
    const x = leftPx + (i + 0.5) * columnWidth;
    const { max } = getMinMaxForColumn(peaks, peakSlice, i, columnCount, channelOffset);
    const yTop = centerY - max * maxAmplitude;
    points.push(`${x} ${yTop}`);
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
