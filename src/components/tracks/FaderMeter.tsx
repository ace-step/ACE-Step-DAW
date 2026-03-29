import { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { METER_GRADIENT_HORIZONTAL, levelToMeterFill } from '../meter-colors';

interface FaderMeterProps {
  trackId: string;
  volume: number;
  onVolumeChange: (volume: number) => void;
  trackName: string;
}

/** Downward-pointing triangle arrow — compact fader position indicator. */
function FaderCap() {
  return (
    <svg width="8" height="7" viewBox="0 0 8 7" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="0,0 8,0 4,7" fill="#d0d0d4" stroke="#888" strokeWidth="0.5" />
    </svg>
  );
}

/**
 * Combined volume fader + stereo level meter.
 * The fader handle sits on top of two horizontal meter bars.
 */
export function FaderMeter({ trackId, volume, onVolumeChange, trackName }: FaderMeterProps) {
  const rafRef = useRef<number>(0);
  const [leftFill, setLeftFill] = useState(0);
  const [rightFill, setRightFill] = useState(0);
  const [clipping, setClipping] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Animate meter levels
  useEffect(() => {
    const engine = getAudioEngine();
    const tick = () => {
      const meter = engine.getTrackMeter(trackId);
      setLeftFill(levelToMeterFill(meter.leftLevel));
      setRightFill(levelToMeterFill(meter.rightLevel));
      setClipping((was) => was || meter.clipped);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [trackId]);

  const resetClip = useCallback(() => {
    const engine = getAudioEngine();
    engine.resetTrackClip(trackId);
    setClipping(false);
  }, [trackId]);

  // Convert pointer X to volume 0..1
  const getVolumeFromX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return volume;
    const rect = el.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(1, ratio));
  }, [volume]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onVolumeChange(getVolumeFromX(e.clientX));
  }, [getVolumeFromX, onVolumeChange]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    onVolumeChange(getVolumeFromX(e.clientX));
  }, [getVolumeFromX, onVolumeChange]);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const onDoubleClick = useCallback(() => {
    onVolumeChange(0.8); // Reset to default
  }, [onVolumeChange]);

  const faderPct = volume * 100;

  return (
    <div
      ref={containerRef}
      className="relative w-full cursor-ew-resize select-none"
      style={{ height: '18px' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
      title={`Volume: ${Math.round(volume * 100)}%`}
      aria-label={`${trackName} volume`}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(volume * 100)}
      data-testid="fader-meter"
    >
      {/* Meter bars — simple width fill, green solid */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex flex-col gap-[1px]">
        {/* Left channel */}
        <div className="h-[5px] rounded-[2px] bg-zinc-800/50 overflow-hidden">
          <div
            data-testid="meter-left"
            aria-label={`Left channel level for ${trackId}`}
            className="h-full rounded-[2px]"
            style={{
              width: `${leftFill * 100}%`,
              backgroundColor: '#4ade80',
              opacity: 0.75,
            }}
          />
        </div>
        {/* Right channel */}
        <div className="h-[5px] rounded-[2px] bg-zinc-800/50 overflow-hidden">
          <div
            data-testid="meter-right"
            aria-label={`Right channel level for ${trackId}`}
            className="h-full rounded-[2px]"
            style={{
              width: `${rightFill * 100}%`,
              backgroundColor: '#4ade80',
              opacity: 0.75,
            }}
          />
        </div>
      </div>

      {/* Fader arrow — downward triangle indicating position */}
      <div
        className="absolute top-0 pointer-events-none"
        style={{ left: `${faderPct}%`, transform: 'translateX(-50%)', marginTop: '-1px' }}
      >
        <FaderCap />
      </div>

      {/* Clip indicator — only visible when clipping */}
      <div
        data-testid="clip-indicator"
        className={`absolute top-0 -right-[2px] w-[5px] h-[5px] rounded-full cursor-pointer transition-colors ${
          clipping
            ? 'bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.6)]'
            : 'bg-transparent'
        }`}
        title={clipping ? 'Clipping detected — click to reset' : ''}
        onClick={(e) => { e.stopPropagation(); resetClip(); }}
      />
    </div>
  );
}
