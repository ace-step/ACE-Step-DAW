import { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioEngine } from '../../hooks/useAudioEngine';

interface FaderMeterProps {
  trackId: string;
  volume: number;
  onVolumeChange: (volume: number) => void;
  trackName: string;
}

/** Convert linear level (0..1+) to a 0..1 fill fraction mapping -60dB..0dB */
function levelToFill(linear: number): number {
  if (linear <= 0) return 0;
  const db = 20 * Math.log10(linear);
  return Math.max(0, Math.min(1, (db + 60) / 60));
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
      setLeftFill(levelToFill(meter.leftLevel));
      setRightFill(levelToFill(meter.rightLevel));
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
      style={{ height: '14px' }}
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
      {/* Meter background track */}
      <div className="absolute inset-0 flex flex-col justify-center gap-[1px]">
        {/* Left channel */}
        <div className="h-[5px] rounded-full bg-zinc-800/60 overflow-hidden">
          <div
            data-testid="meter-left"
            aria-label={`Left channel level for ${trackId}`}
            className="h-full rounded-full"
            style={{
              width: `${leftFill * 100}%`,
              background: 'linear-gradient(to right, #22c55e 0%, #a3e635 40%, #facc15 70%, #ef4444 95%)',
              opacity: 0.7,
            }}
          />
        </div>
        {/* Right channel */}
        <div className="h-[5px] rounded-full bg-zinc-800/60 overflow-hidden">
          <div
            data-testid="meter-right"
            aria-label={`Right channel level for ${trackId}`}
            className="h-full rounded-full"
            style={{
              width: `${rightFill * 100}%`,
              background: 'linear-gradient(to right, #22c55e 0%, #a3e635 40%, #facc15 70%, #ef4444 95%)',
              opacity: 0.7,
            }}
          />
        </div>
      </div>

      {/* Fader handle — sits on top of the meter */}
      <div
        className="absolute top-0 h-full pointer-events-none"
        style={{ left: `${faderPct}%`, transform: 'translateX(-50%)' }}
      >
        {/* Handle knob */}
        <div
          className="relative h-full flex items-center"
        >
          {/* Vertical line */}
          <div className="w-[2px] h-full bg-white/80 rounded-full shadow-[0_0_4px_rgba(255,255,255,0.3)]" />
          {/* Triangular grip notch */}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[8px] h-[8px] rounded-sm bg-zinc-200 shadow-md border border-zinc-400/50"
            style={{
              background: 'linear-gradient(180deg, #e4e4e7 0%, #a1a1aa 100%)',
            }}
          />
        </div>
      </div>

      {/* Clip indicator (top-right corner) */}
      <div
        data-testid="clip-indicator"
        className={`absolute -top-[1px] -right-[1px] w-[5px] h-[5px] rounded-full cursor-pointer transition-colors ${
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
