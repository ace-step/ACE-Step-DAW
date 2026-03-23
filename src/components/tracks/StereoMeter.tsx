import { useEffect, useRef, useState } from 'react';
import { getAudioEngine } from '../../hooks/useAudioEngine';

interface StereoMeterProps {
  trackId: string;
}

/** Convert linear level (0..1+) to a 0..1 fill fraction mapping -60dB..0dB */
function levelToFill(linear: number): number {
  if (linear <= 0) return 0;
  const db = 20 * Math.log10(linear);
  return Math.max(0, Math.min(1, (db + 60) / 60));
}

export function StereoMeter({ trackId }: StereoMeterProps) {
  const rafRef = useRef<number>(0);
  const [leftFill, setLeftFill] = useState(0);
  const [rightFill, setRightFill] = useState(0);
  const [clipping, setClipping] = useState(false);

  useEffect(() => {
    const engine = getAudioEngine();

    const tick = () => {
      const meter = engine.getTrackMeter(trackId);
      setLeftFill(levelToFill(meter.leftLevel));
      setRightFill(levelToFill(meter.rightLevel));
      setClipping((was) => was || meter.clipped);
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

  return (
    <div className="flex flex-col items-center h-full gap-[1px]">
      {/* Clip indicator dot at top */}
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
      {/* Stereo bars */}
      <div className="flex gap-px flex-1 w-full justify-center items-end">
        <div
          data-testid="meter-left"
          aria-label={`Left channel level for ${trackId}`}
          className="w-[3px] rounded-sm"
          style={{
            height: `${leftFill * 100}%`,
            background: 'linear-gradient(to top, #22c55e, #facc15 70%, #ef4444 95%)',
          }}
        />
        <div
          data-testid="meter-right"
          aria-label={`Right channel level for ${trackId}`}
          className="w-[3px] rounded-sm"
          style={{
            height: `${rightFill * 100}%`,
            background: 'linear-gradient(to top, #22c55e, #facc15 70%, #ef4444 95%)',
          }}
        />
      </div>
    </div>
  );
}
