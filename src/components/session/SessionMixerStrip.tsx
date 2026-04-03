import { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { Knob } from '../ui/Knob';

/** Convert linear level (0..1+) to a 0..1 fill fraction mapping -60dB..0dB */
function levelToFill(linear: number): number {
  if (linear <= 0) return 0;
  const db = 20 * Math.log10(linear);
  return Math.max(0, Math.min(1, (db + 60) / 60));
}

export interface SessionMixerStripProps {
  trackId: string;
  trackName: string;
  trackColor: string;
  volume: number;
  pan: number;
  muted: boolean;
  soloed: boolean;
  onVolumeChange?: (volume: number) => void;
  onPanChange?: (pan: number) => void;
  onMuteToggle?: () => void;
  onSoloToggle?: () => void;
}

export function SessionMixerStrip({
  trackId,
  trackName,
  trackColor,
  volume,
  pan,
  muted,
  soloed,
  onVolumeChange,
  onPanChange,
  onMuteToggle,
  onSoloToggle,
}: SessionMixerStripProps) {
  const rafRef = useRef<number>(0);
  const [leftFill, setLeftFill] = useState(0);
  const [rightFill, setRightFill] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Animate meter levels
  useEffect(() => {
    const engine = getAudioEngine();
    const tick = () => {
      const meter = engine.getTrackMeter(trackId);
      setLeftFill(levelToFill(meter.leftLevel));
      setRightFill(levelToFill(meter.rightLevel));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [trackId]);

  // Fader drag logic
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
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    onVolumeChange?.(getVolumeFromX(e.clientX));
  }, [getVolumeFromX, onVolumeChange]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    onVolumeChange?.(getVolumeFromX(e.clientX));
  }, [getVolumeFromX, onVolumeChange]);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const onDoubleClick = useCallback(() => {
    onVolumeChange?.(0.8);
  }, [onVolumeChange]);

  const faderPct = volume * 100;

  return (
    <div
      className="flex items-center gap-2 h-10 px-2 bg-[#1b1b1b] border-b border-[#2e2e2e]"
      data-testid={`session-mixer-strip-${trackId}`}
    >
      {/* Track color accent */}
      <div
        className="w-1 h-6 rounded-sm shrink-0"
        style={{ backgroundColor: trackColor }}
        data-testid="track-color-accent"
      />

      {/* Track name (truncated) */}
      <div className="w-16 truncate text-[10px] text-zinc-400 shrink-0" title={trackName}>
        {trackName}
      </div>

      {/* Volume fader with meter */}
      <div
        ref={containerRef}
        className="relative flex-1 min-w-[80px] max-w-[160px] cursor-ew-resize select-none"
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
      >
        {/* Meter bars */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex flex-col gap-[1px]">
          <div className="h-[4px] rounded-[2px] bg-zinc-800/50 overflow-hidden">
            <div
              className="h-full rounded-[2px]"
              style={{
                width: `${leftFill * 100}%`,
                background: 'linear-gradient(to right, #22c55e 0%, #84cc16 35%, #eab308 65%, #ef4444 95%)',
                opacity: 0.7,
              }}
            />
          </div>
          <div className="h-[4px] rounded-[2px] bg-zinc-800/50 overflow-hidden">
            <div
              className="h-full rounded-[2px]"
              style={{
                width: `${rightFill * 100}%`,
                background: 'linear-gradient(to right, #22c55e 0%, #84cc16 35%, #eab308 65%, #ef4444 95%)',
                opacity: 0.7,
              }}
            />
          </div>
        </div>

        {/* Fader position indicator */}
        <div
          className="absolute top-0 h-full w-[2px] bg-zinc-300 pointer-events-none"
          style={{ left: `${faderPct}%`, transform: 'translateX(-50%)' }}
        />
      </div>

      {/* Pan knob */}
      <div className="shrink-0">
        <Knob
          value={pan}
          min={-1}
          max={1}
          defaultValue={0}
          onChange={(v) => onPanChange?.(v)}
          label="Pan"
          size={24}
          step={0.01}
        />
      </div>

      {/* Solo button */}
      <button
        onClick={onSoloToggle}
        className={`w-6 h-6 rounded text-[10px] font-bold shrink-0 transition-all duration-200 ${
          soloed
            ? 'bg-amber-400 text-black shadow-[0_0_6px_rgba(251,191,36,0.5)]'
            : 'bg-[#343434] text-zinc-400 hover:bg-[#404040]'
        }`}
        aria-label={`Solo ${trackName}`}
        title={soloed ? 'Unsolo' : 'Solo'}
      >
        S
      </button>

      {/* Mute button */}
      <button
        onClick={onMuteToggle}
        className={`w-6 h-6 rounded text-[10px] font-bold shrink-0 transition-all duration-200 ${
          muted
            ? 'bg-red-500 text-white shadow-[0_0_6px_rgba(239,68,68,0.4)]'
            : 'bg-[#343434] text-zinc-400 hover:bg-[#404040]'
        }`}
        aria-label={`Mute ${trackName}`}
        title={muted ? 'Unmute' : 'Mute'}
      >
        M
      </button>
    </div>
  );
}
