import { useEffect, useRef, useState } from 'react';
import { getAudioEngine, getTauriPlaybackClockOwner } from '../../hooks/useAudioEngine';
import { getAudioBridge } from '../../engine/bridge';
import { METER_GRADIENT_HORIZONTAL, levelToMeterFill } from '../meter-colors';

interface StereoMeterProps {
  trackId: string;
}

export function StereoMeter({ trackId }: StereoMeterProps) {
  const rafRef = useRef<number>(0);
  const [leftFill, setLeftFill] = useState(0);
  const [rightFill, setRightFill] = useState(0);
  const [clipping, setClipping] = useState(false);

  useEffect(() => {
    const engine = getAudioEngine();
    const bridge = getAudioBridge(engine);

    const tick = () => {
      const meterSource = bridge.backend === 'tauri' && getTauriPlaybackClockOwner() === 'native'
        ? bridge
        : engine;
      const meter = meterSource.getTrackMeter(trackId);
      setLeftFill(levelToMeterFill(meter.leftLevel));
      setRightFill(levelToMeterFill(meter.rightLevel));
      setClipping((was) => was || meter.clipped);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [trackId]);

  const resetClip = () => {
    const engine = getAudioEngine();
    const bridge = getAudioBridge(engine);
    const meterSource = bridge.backend === 'tauri' && getTauriPlaybackClockOwner() === 'native'
      ? bridge
      : engine;
    meterSource.resetTrackClip(trackId);
    setClipping(false);
  };

  return (
    <div className="flex flex-col gap-[2px] w-full">
      {/* Left channel — simple green fill */}
      <div className="flex items-center gap-1 w-full">
        <div className="flex-1 h-[4px] rounded-full bg-zinc-800 overflow-hidden">
          <div
            data-testid="meter-left"
            aria-label={`Left channel level for ${trackId}`}
            className="h-full rounded-full transition-[width] duration-75"
            style={{
              width: `${leftFill * 100}%`,
              backgroundColor: '#4ade80',
            }}
          />
        </div>
        {/* Clip indicator */}
        <div
          data-testid="clip-indicator"
          className={`w-[5px] h-[5px] rounded-full flex-shrink-0 cursor-pointer transition-colors ${
            clipping
              ? 'bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.6)]'
              : 'bg-zinc-700'
          }`}
          title={clipping ? 'Clipping detected — click to reset' : 'Clip indicator'}
          onClick={resetClip}
        />
      </div>
      {/* Right channel */}
      <div className="flex items-center gap-1 w-full">
        <div className="flex-1 h-[4px] rounded-full bg-zinc-800 overflow-hidden">
          <div
            data-testid="meter-right"
            aria-label={`Right channel level for ${trackId}`}
            className="h-full rounded-full transition-[width] duration-75"
            style={{
              width: `${rightFill * 100}%`,
              backgroundColor: '#4ade80',
            }}
          />
        </div>
        <div className="w-[5px] h-[5px] flex-shrink-0" />
      </div>
    </div>
  );
}
