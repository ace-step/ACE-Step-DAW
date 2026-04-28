import { useEffect, useRef, useCallback } from 'react';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { METER_CANVAS_STOPS, METER_DB_TICKS, METER_DB_TICKS_MINOR, METER_PADDING_PCT, dbToFill, levelToFill } from '../meter-colors';

const BAR_WIDTH = 4;
const BAR_GAP = 1;
const FALL_RATE_PER_FRAME = 0.012;
const PEAK_HOLD_FRAMES = 18;
const CLIP_INDICATOR_SIZE = 8;

/** Left-side tick width + arrow space */
const SCALE_LEFT_W = 10;
/** Right-side number width */
const SCALE_RIGHT_W = 16;

export interface LevelMeterProps {
  trackId?: string;
  masterStage?: 'input' | 'output';
  returnTrackId?: string;
  stereo?: boolean;
  showScale?: boolean;
}

interface BarState {
  level: number;
  peakLevel: number;
  peakHoldFrames: number;
}

/** Convert a 0..1 fill to a top-percentage with padding. */
function fillToTopPct(fill: number): number {
  const pad = METER_PADDING_PCT;
  return pad + (1 - fill) * (100 - 2 * pad);
}

export function LevelMeter({ trackId, masterStage, returnTrackId, stereo, showScale }: LevelMeterProps) {
  const rafRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const leftBar = useRef<BarState>({ level: 0, peakLevel: 0, peakHoldFrames: 0 });
  const rightBar = useRef<BarState>({ level: 0, peakLevel: 0, peakHoldFrames: 0 });
  const clippedRef = useRef(false);
  const clippedStateRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isStereo = stereo ?? !masterStage;
  const totalBarWidth = isStereo ? BAR_WIDTH * 2 + BAR_GAP : BAR_WIDTH;
  const meterLeft = showScale ? SCALE_LEFT_W : 3;
  const containerWidth = showScale
    ? SCALE_LEFT_W + totalBarWidth + 2 + SCALE_RIGHT_W
    : totalBarWidth + 6;

  const updateBar = useCallback((bar: BarState, nextLevel: number): void => {
    const fill = levelToFill(nextLevel);
    bar.level = fill;
    if (fill >= bar.peakLevel) {
      bar.peakLevel = fill;
      bar.peakHoldFrames = PEAK_HOLD_FRAMES;
    } else if (bar.peakHoldFrames > 0) {
      bar.peakHoldFrames -= 1;
    } else {
      bar.peakLevel = Math.max(fill, bar.peakLevel - FALL_RATE_PER_FRAME);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    const ensureGradient = (h: number): CanvasGradient => {
      const grad = ctx2d.createLinearGradient(0, h, 0, 0);
      for (const [pos, color] of METER_CANVAS_STOPS) {
        grad.addColorStop(pos, color);
      }
      return grad;
    };

    const engine = getAudioEngine();

    const tick = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      let leftLevel = 0;
      let rightLevel = 0;
      let clipped = false;

      if (masterStage) {
        const meter = engine.getMasterMeter(masterStage);
        leftLevel = meter.level;
        rightLevel = meter.level;
        clipped = meter.clipped;
      } else if (returnTrackId) {
        const meter = engine.getReturnTrackMeter(returnTrackId);
        leftLevel = meter.level;
        rightLevel = meter.level;
        clipped = meter.clipped;
      } else if (trackId) {
        const meter = engine.getTrackMeter(trackId);
        leftLevel = isStereo ? meter.leftLevel : meter.level;
        rightLevel = isStereo ? meter.rightLevel : meter.level;
        clipped = meter.clipped;
      }

      clippedRef.current = clippedRef.current || clipped;
      if (clippedRef.current !== clippedStateRef.current) {
        clippedStateRef.current = clippedRef.current;
        const container = containerRef.current;
        if (container) {
          const btn = container.querySelector('[data-clip-btn]') as HTMLElement | null;
          if (btn) btn.style.display = clippedRef.current ? 'block' : 'none';
        }
      }

      updateBar(leftBar.current, leftLevel);
      updateBar(rightBar.current, rightLevel);

      ctx2d.clearRect(0, 0, w, h);

      // Padded active area
      const padPx = Math.round(h * METER_PADDING_PCT / 100);
      const activeH = h - 2 * padPx;
      const activeBottom = h - padPx;
      const grad = ensureGradient(activeH);

      const drawBar = (bar: BarState, x: number, barW: number) => {
        const levelH = Math.max(0, Math.min(1, bar.level)) * activeH;
        const peakY = Math.max(0, Math.min(1, bar.peakLevel)) * activeH;

        ctx2d.fillStyle = '#1a1a1a';
        ctx2d.fillRect(x, 0, barW, h);

        if (levelH > 0) {
          ctx2d.save();
          ctx2d.beginPath();
          ctx2d.rect(x, activeBottom - levelH, barW, levelH);
          ctx2d.clip();
          ctx2d.fillStyle = grad;
          ctx2d.fillRect(x, padPx, barW, activeH);
          ctx2d.restore();
        }

        if (bar.peakLevel > 0.005) {
          const peakYPos = activeBottom - peakY;
          ctx2d.fillStyle = clippedRef.current ? '#ef4444' : 'rgba(255,255,255,0.9)';
          ctx2d.fillRect(x, peakYPos - 1, barW, 2);
        }
      };

      if (isStereo) {
        const barW = Math.round(BAR_WIDTH * dpr);
        const gap = Math.round(BAR_GAP * dpr);
        drawBar(leftBar.current, 0, barW);
        drawBar(rightBar.current, barW + gap, barW);
      } else {
        drawBar(leftBar.current, 0, w);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [trackId, masterStage, returnTrackId, isStereo, updateBar]);

  const label = masterStage
    ? `Master ${masterStage} level meter`
    : returnTrackId
      ? `Return track level meter for ${returnTrackId}`
      : `Mixer level meter for ${trackId}`;
  const clipResetLabel = masterStage
    ? `Reset clip indicator for master ${masterStage}`
    : returnTrackId
      ? `Reset clip indicator for return ${returnTrackId}`
      : `Reset clip indicator for ${trackId}`;

  const resetClip = () => {
    const engine = getAudioEngine();
    if (masterStage) {
      engine.resetMasterClip(masterStage);
    } else if (returnTrackId) {
      engine.resetReturnTrackClip(returnTrackId);
    } else if (trackId) {
      engine.resetTrackClip(trackId);
    }
    clippedRef.current = false;
    clippedStateRef.current = false;
    const container = containerRef.current;
    if (container) {
      const btn = container.querySelector('[data-clip-btn]') as HTMLElement | null;
      if (btn) btn.style.display = 'none';
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full"
      style={{ width: containerWidth }}
      data-testid="level-meter"
    >
      <button
        type="button"
        data-clip-btn
        aria-label={clipResetLabel}
        className="absolute top-1 z-10 rounded-full border border-red-200/40 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.75)]"
        style={{ width: CLIP_INDICATOR_SIZE, height: CLIP_INDICATOR_SIZE, display: 'none', left: meterLeft + totalBarWidth / 2 - CLIP_INDICATOR_SIZE / 2 }}
        onClick={resetClip}
        title="Reset clip indicator"
      />

      {/* CENTER: meter canvas + peak glow overlay */}
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label || "Audio level meter"}
        data-testid="meter-canvas"
        className="absolute inset-y-0 rounded-sm"
        style={{ width: totalBarWidth, height: '100%', left: meterLeft }}
      />
      {/* Subtle glow overlay — CSS shadow that gives meters a luminous feel */}
      <div
        data-meter-glow
        className="absolute inset-y-0 rounded-sm pointer-events-none"
        style={{
          width: totalBarWidth,
          left: meterLeft,
          boxShadow: '0 0 4px rgba(74, 222, 128, 0.15)',
          mixBlendMode: 'screen',
        }}
      />

      {/* Unified scale: tick LEFT + number RIGHT, each mark is one element */}
      {showScale && (
        <div
          className="absolute inset-y-0 pointer-events-none"
          style={{ left: 0, width: containerWidth }}
          aria-hidden="true"
        >
          {/* Major ticks with numbers */}
          {METER_DB_TICKS.map((db) => {
            const topPct = fillToTopPct(dbToFill(db));
            return (
              <div
                key={db}
                className="absolute flex items-center"
                style={{ top: `${topPct}%`, transform: 'translateY(-50%)', left: 0, right: 0 }}
              >
                {/* Left tick mark */}
                <span className="inline-block w-[5px] h-[1px] bg-zinc-500" style={{ marginLeft: SCALE_LEFT_W - 5 }} />
                {/* Spacer over meter bar */}
                <span style={{ width: meterLeft - SCALE_LEFT_W + totalBarWidth + 2, flexShrink: 0 }} />
                {/* Right number */}
                <span className="text-[8px] leading-none text-zinc-500 font-mono">
                  {Math.abs(db)}
                </span>
              </div>
            );
          })}
          {/* Minor ticks — right-aligned with major ticks */}
          {METER_DB_TICKS_MINOR.map((db) => (
            <div
              key={db}
              className="absolute flex items-center"
              style={{ top: `${fillToTopPct(dbToFill(db))}%`, transform: 'translateY(-50%)', left: 0, right: 0 }}
            >
              <span className="inline-block w-[3px] h-[1px] bg-zinc-600" style={{ marginLeft: SCALE_LEFT_W - 3 }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
