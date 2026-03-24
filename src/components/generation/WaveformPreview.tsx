import { useCallback, useRef } from 'react';
import { PEAK_STRIDE } from '../../utils/waveformPeaks';

export interface WaveformPreviewProps {
  /** Interleaved stereo peaks [Lmax, Lmin, Rmax, Rmin, ...] or simple amplitude array */
  peaks: number[];
  /** Fill color for the waveform bars */
  color: string;
  /** Container height in px */
  height: number;
  /** 0-1 playback progress for the overlay */
  playbackProgress: number;
  /** Callback when user clicks to seek (0-1 normalized position) */
  onSeek?: (progress: number) => void;
  /** Optional test id */
  'data-testid'?: string;
}

/**
 * Simplified waveform renderer for the Enhance Panel.
 * Renders stereo waveform peaks with a playback progress overlay.
 */
export function WaveformPreview({
  peaks,
  color,
  height,
  playbackProgress,
  onSeek,
  'data-testid': testId,
}: WaveformPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onSeek || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const progress = Math.max(0, Math.min(1, x / rect.width));
      onSeek(progress);
    },
    [onSeek],
  );

  if (!peaks || peaks.length === 0) {
    return (
      <div
        data-testid={testId}
        className="bg-[#1e1e22] rounded flex items-center justify-center"
        style={{ height }}
      >
        <span className="text-[9px] text-zinc-600">No waveform data</span>
      </div>
    );
  }

  const isStereo = peaks.length >= PEAK_STRIDE && peaks.length % PEAK_STRIDE === 0;
  const logicalCount = isStereo ? peaks.length / PEAK_STRIDE : peaks.length;

  return (
    <div
      ref={containerRef}
      data-testid={testId}
      className="relative bg-[#1e1e22] rounded overflow-hidden"
      style={{ height, cursor: onSeek ? 'pointer' : 'default' }}
      onClick={handleClick}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${logicalCount} 100`}
        preserveAspectRatio="none"
        className="absolute inset-0"
      >
        {isStereo
          ? renderStereoPeaks(peaks, logicalCount, color)
          : renderSimplePeaks(peaks, color)}
      </svg>
      {/* Playback progress overlay */}
      {playbackProgress > 0 && (
        <div
          data-testid={testId ? `${testId}-progress` : undefined}
          className="absolute inset-y-0 left-0 pointer-events-none"
          style={{
            width: `${Math.min(100, playbackProgress * 100)}%`,
            background: `${color}33`,
          }}
        />
      )}
      {/* Playhead line */}
      {playbackProgress > 0 && playbackProgress < 1 && (
        <div
          className="absolute inset-y-0 w-px pointer-events-none"
          style={{
            left: `${playbackProgress * 100}%`,
            backgroundColor: color,
          }}
        />
      )}
    </div>
  );
}

export function renderStereoPeaks(peaks: number[], logicalCount: number, color: string) {
  // Build SVG path for combined L+R envelope centered at y=50
  const upperPoints: string[] = [];
  const lowerPoints: string[] = [];

  for (let i = 0; i < logicalCount; i++) {
    const idx = i * PEAK_STRIDE;
    const lMax = peaks[idx] ?? 0;
    const lMin = peaks[idx + 1] ?? 0;
    const rMax = peaks[idx + 2] ?? 0;
    const rMin = peaks[idx + 3] ?? 0;
    // Combine channels: take the max of both channels for the envelope
    const maxVal = Math.max(lMax, rMax);
    const minVal = Math.min(lMin, rMin);
    const x = i + 0.5;
    upperPoints.push(`${x} ${50 - maxVal * 48}`);
    lowerPoints.push(`${x} ${50 - minVal * 48}`);
  }

  const path = `M ${upperPoints[0]} L ${upperPoints.join(' L ')} L ${lowerPoints.reverse().join(' L ')} Z`;
  return <path d={path} fill={color} opacity={0.6} data-testid="waveform-path" />;
}

export function renderSimplePeaks(peaks: number[], color: string) {
  // Simple amplitude bars centered vertically
  const count = peaks.length;
  const upperPoints: string[] = [];
  const lowerPoints: string[] = [];

  for (let i = 0; i < count; i++) {
    const val = Math.abs(peaks[i]);
    const x = i + 0.5;
    upperPoints.push(`${x} ${50 - val * 48}`);
    lowerPoints.push(`${x} ${50 + val * 48}`);
  }

  const path = `M ${upperPoints[0]} L ${upperPoints.join(' L ')} L ${lowerPoints.reverse().join(' L ')} Z`;
  return <path d={path} fill={color} opacity={0.6} data-testid="waveform-path" />;
}
