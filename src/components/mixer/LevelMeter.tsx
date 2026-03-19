import { useEffect, useRef, useState } from 'react';
import { getAudioEngine } from '../../hooks/useAudioEngine';

const METER_WIDTH = 8;
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

interface LevelMeterProps {
  trackId?: string;
  masterStage?: 'input' | 'output';
}

export function LevelMeter({ trackId, masterStage }: LevelMeterProps) {
  const rafRef = useRef<number>(0);
  const peakLevelRef = useRef(0);
  const peakHoldFramesRef = useRef(0);
  const [level, setLevel] = useState(0);
  const [peakLevel, setPeakLevel] = useState(0);

  useEffect(() => {
    const engine = getAudioEngine();

    const tick = () => {
      const nextLevel = masterStage
        ? engine.getMasterLevel(masterStage)
        : trackId
          ? engine.getTrackLevel(trackId)
          : 0;
      setLevel(nextLevel);

      if (nextLevel >= peakLevelRef.current) {
        peakLevelRef.current = nextLevel;
        peakHoldFramesRef.current = PEAK_HOLD_FRAMES;
      } else if (peakHoldFramesRef.current > 0) {
        peakHoldFramesRef.current -= 1;
      } else {
        peakLevelRef.current = Math.max(nextLevel, peakLevelRef.current - FALL_RATE_PER_FRAME);
      }

      setPeakLevel(peakLevelRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [trackId, masterStage]);

  const label = masterStage
    ? `Master ${masterStage} level meter`
    : `Track level meter for ${trackId}`;

  return (
    <div
      aria-label={label}
      className="relative h-full rounded-full border border-white/10 bg-[#111] overflow-hidden"
      style={{ width: METER_WIDTH }}
    >
      <div
        className="absolute inset-x-0 bottom-0 transition-[height] duration-75 ease-out"
        style={{
          height: `${Math.max(0, Math.min(1, level)) * 100}%`,
          background: `linear-gradient(to top, ${getMeterColor(level)} 0%, ${getMeterColor(level)}dd 100%)`,
        }}
      />
      <div
        className="absolute inset-x-0 h-[2px] bg-white/90 shadow-[0_0_4px_rgba(255,255,255,0.45)]"
        style={{ bottom: `calc(${Math.max(0, Math.min(1, peakLevel)) * 100}% - 1px)` }}
      />
    </div>
  );
}
