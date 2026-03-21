import type { MidiClipData, StretchMode } from '../../types/project';
import { getClipSourceSpan, getClipWaveformLayout } from '../../utils/clipAudio';

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
  const peakSlice = getVisiblePeakSlice(peaks, audioDuration, audioOffset, getClipSourceSpan(clipWindow));

  if (!peaks || peakSlice.numBars === 0 || contentWidth <= 0 || waveformLayout.widthPx <= 0) {
    return null;
  }

  const columnCount = Math.max(1, Math.floor(waveformLayout.widthPx));
  const columnWidth = waveformLayout.widthPx / columnCount;

  return (
    <div className="absolute inset-0 flex items-center overflow-hidden">
      <svg
        width={contentWidth}
        height="100%"
        viewBox={`0 0 ${contentWidth} 100`}
        preserveAspectRatio="none"
        className={opacityClassName}
      >
        {Array.from({ length: columnCount }, (_, index) => {
          const peak = getPeakForColumn(peaks, peakSlice, index, columnCount);
          const height = peak * 80;

          return (
            <rect
              key={index}
              x={waveformLayout.leftPx + index * columnWidth}
              y={50 - height / 2}
              width={Math.max(columnWidth, 1)}
              height={Math.max(height, 1)}
              fill={color}
              rx={0.4}
            />
          );
        })}
      </svg>
    </div>
  );
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

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ top: 14 }}>
      <svg width="100%" height="100%" preserveAspectRatio="none" viewBox={`0 0 ${width} 100`}>
        {midiData.notes.map((note, index) => {
          const x = (note.startBeat * secPerBeat / duration) * width;
          const noteWidth = Math.max((note.durationBeats * secPerBeat / duration) * width, 1);
          const y = 100 - ((note.pitch - minPitch + pad) / (range + pad * 2)) * 100;
          const height = Math.max(100 / (range + pad * 2), 2);

          return <rect key={index} x={x} y={y} width={noteWidth} height={height} fill={color} opacity={0.8} rx={0.5} />;
        })}
      </svg>
    </div>
  );
}

function getVisiblePeakSlice(
  peaks: number[] | null,
  audioDuration: number,
  audioOffset: number,
  sourceSpan: number,
) {
  if (!peaks || peaks.length === 0 || audioDuration <= 0) {
    return { startPeakIdx: 0, numBars: 0 };
  }

  const startPeakIdx = Math.floor((audioOffset / audioDuration) * peaks.length);
  const visibleAudioSec = Math.min(sourceSpan, Math.max(0, audioDuration - audioOffset));
  const endPeakIdx = Math.min(
    Math.ceil(((audioOffset + visibleAudioSec) / audioDuration) * peaks.length),
    peaks.length,
  );

  return {
    startPeakIdx,
    numBars: Math.max(0, endPeakIdx - startPeakIdx),
  };
}

function getPeakForColumn(
  peaks: number[],
  peakSlice: { startPeakIdx: number; numBars: number },
  columnIndex: number,
  columnCount: number,
) {
  const start = peakSlice.startPeakIdx + Math.floor((columnIndex / columnCount) * peakSlice.numBars);
  const end = peakSlice.startPeakIdx + Math.ceil(((columnIndex + 1) / columnCount) * peakSlice.numBars);
  let maxPeak = 0;

  for (let index = start; index < Math.min(end, peaks.length); index += 1) {
    maxPeak = Math.max(maxPeak, peaks[index] ?? 0);
  }

  return maxPeak;
}
