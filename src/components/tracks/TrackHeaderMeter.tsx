import { useEffect, useRef, useState } from 'react';
import { getAudioEngine } from '../../hooks/useAudioEngine';

const FALL_RATE_PER_FRAME = 0.012;
const PEAK_HOLD_FRAMES = 18;

function levelToDb(level: number): number {
  if (level <= 0) return -Infinity;
  return 20 * Math.log10(level);
}

function getMeterColor(level: number): string {
  const db = levelToDb(level);
  if (db > -3) return '#ef4444';
  if (db >= -12) return '#facc15';
  return '#22c55e';
}

interface TrackHeaderMeterProps {
  trackId: string;
}

export function TrackHeaderMeter({ trackId }: TrackHeaderMeterProps) {
  const rafRef = useRef<number>(0);
  const peakLevelRef = useRef(0);
  const peakHoldFramesRef = useRef(0);
  const [level, setLevel] = useState(0);
  const [peakLevel, setPeakLevel] = useState(0);
  const [clipping, setClipping] = useState(false);

  useEffect(() => {
    const engine = getAudioEngine();

    const tick = () => {
      const meter = engine.getTrackMeter(trackId);
      const nextLevel = meter.level;
      setLevel(nextLevel);

      // Clip detection — uses engine's clipped flag (> 0dB), latches until reset
      setClipping((wasClipping) => wasClipping || meter.clipped);

      // Peak hold logic
      if (nextLevel >= peakLevelRef.current) {
        peakLevelRef.current = nextLevel;
        peakHoldFramesRef.current = PEAK_HOLD_FRAMES;
      } else if (peakHoldFramesRef.current > 0) {
        peakHoldFramesRef.current -= 1;
      } else {
        peakLevelRef.current = Math.max(
          nextLevel,
          peakLevelRef.current - FALL_RATE_PER_FRAME,
        );
      }
      setPeakLevel(peakLevelRef.current);

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [trackId]);

  const resetClip = () => {
    const engine = getAudioEngine();
    engine.resetTrackClip(trackId);
    setClipping(false);
  };

  const clampedLevel = Math.max(0, Math.min(1, level));
  const clampedPeak = Math.max(0, Math.min(1, peakLevel));

  return (
    <div className="flex items-center gap-1 w-full">
      <div
        aria-label={`Track header level meter for ${trackId}`}
        className="relative flex-1 min-w-[6px] h-[4px] rounded-full bg-[#111] overflow-hidden border border-white/5"
      >
        {/* Level bar */}
        <div
          data-testid="meter-level"
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-75 ease-out"
          style={{
            width: `${clampedLevel * 100}%`,
            background: getMeterColor(level),
          }}
        />
        {/* Peak hold indicator — turns red when clipping */}
        <div
          data-testid="meter-peak"
          className={`absolute top-0 bottom-0 w-[2px] ${
            clipping ? 'bg-red-500' : 'bg-white/80'
          }`}
          style={{ left: `${clampedPeak * 100}%` }}
        />
      </div>
      {/* Clip indicator dot */}
      <div
        data-testid="clip-indicator"
        className={`w-[6px] h-[6px] rounded-full flex-shrink-0 cursor-pointer transition-colors ${
          clipping
            ? 'bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.6)]'
            : 'bg-zinc-700'
        }`}
        title={clipping ? 'Clipping detected — click to reset' : 'Clip indicator'}
        onClick={resetClip}
      />
    </div>
  );
}
