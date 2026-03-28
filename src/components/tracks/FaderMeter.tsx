import { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { METER_GRADIENT_HORIZONTAL } from '../meter-colors';

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
 * Horizontal fader handle SVG — mimics a real mixer fader cap.
 * Metallic look with grip lines, rendered as pure vector.
 */
function FaderCap() {
  return (
    <svg width="12" height="18" viewBox="0 0 12 18" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-md">
      {/* Body — rounded rect with metallic gradient */}
      <defs>
        <linearGradient id="faderCapGrad" x1="0" y1="0" x2="12" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#b0b0b8" />
          <stop offset="20%" stopColor="#e0e0e4" />
          <stop offset="50%" stopColor="#f5f5f7" />
          <stop offset="80%" stopColor="#e0e0e4" />
          <stop offset="100%" stopColor="#a8a8b0" />
        </linearGradient>
      </defs>
      <rect x="1" y="0.5" width="10" height="17" rx="2" fill="url(#faderCapGrad)" stroke="#78787e" strokeWidth="0.5" />
      {/* Center grip lines */}
      <line x1="4" y1="6" x2="4" y2="12" stroke="#999" strokeWidth="0.6" strokeLinecap="round" />
      <line x1="6" y1="5" x2="6" y2="13" stroke="#999" strokeWidth="0.6" strokeLinecap="round" />
      <line x1="8" y1="6" x2="8" y2="12" stroke="#999" strokeWidth="0.6" strokeLinecap="round" />
      {/* Center notch line — white highlight */}
      <line x1="6" y1="1.5" x2="6" y2="3.5" stroke="#fff" strokeWidth="0.8" strokeLinecap="round" opacity="0.9" />
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
      {/* Meter bars — background for the fader */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex flex-col gap-[1px]">
        {/* Left channel */}
        <div className="h-[5px] rounded-[2px] bg-zinc-800/50 overflow-hidden">
          <div
            data-testid="meter-left"
            aria-label={`Left channel level for ${trackId}`}
            className="h-full rounded-[2px]"
            style={{
              width: `${leftFill * 100}%`,
              background: METER_GRADIENT_HORIZONTAL,
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
              background: METER_GRADIENT_HORIZONTAL,
              opacity: 0.75,
            }}
          />
        </div>
      </div>

      {/* Fader cap — SVG mixer knob riding on the meter */}
      <div
        className="absolute top-0 pointer-events-none"
        style={{ left: `${faderPct}%`, transform: 'translateX(-50%)' }}
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
