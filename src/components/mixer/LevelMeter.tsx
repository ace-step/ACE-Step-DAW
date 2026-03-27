import { useEffect, useRef, useCallback } from 'react';
import { getAudioEngine } from '../../hooks/useAudioEngine';

const BAR_WIDTH = 4;
const BAR_GAP = 1;
const FALL_RATE_PER_FRAME = 0.012;
const PEAK_HOLD_FRAMES = 18;
const CLIP_INDICATOR_SIZE = 8;

/** Static 3-stop gradient: green at bottom, yellow at ~75%, red at top. */
const METER_GRADIENT = 'linear-gradient(to top, #22c55e 0%, #22c55e 60%, #facc15 78%, #ef4444 95%)';

export interface LevelMeterProps {
  trackId?: string;
  masterStage?: 'input' | 'output';
  /** Show stereo L/R bars (default true for tracks, false for master). */
  stereo?: boolean;
}

interface BarState {
  level: number;
  peakLevel: number;
  peakHoldFrames: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Pro-grade peak level meter with stereo L/R bars, gradient coloring,
 * and peak-hold indicators.
 */
export function LevelMeter({ trackId, masterStage, stereo }: LevelMeterProps) {
  const rafRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const leftBar = useRef<BarState>({ level: 0, peakLevel: 0, peakHoldFrames: 0 });
  const rightBar = useRef<BarState>({ level: 0, peakLevel: 0, peakHoldFrames: 0 });
  const clippedRef = useRef(false);
  const clippedStateRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isStereo = stereo ?? !masterStage;
  const totalWidth = isStereo ? BAR_WIDTH * 2 + BAR_GAP : BAR_WIDTH;

  const updateBar = useCallback((bar: BarState, nextLevel: number): void => {
    bar.level = nextLevel;
    if (nextLevel >= bar.peakLevel) {
      bar.peakLevel = nextLevel;
      bar.peakHoldFrames = PEAK_HOLD_FRAMES;
    } else if (bar.peakHoldFrames > 0) {
      bar.peakHoldFrames -= 1;
    } else {
      bar.peakLevel = Math.max(nextLevel, bar.peakLevel - FALL_RATE_PER_FRAME);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    // Create gradient once for reuse
    let gradientCanvas: HTMLCanvasElement | null = null;

    const ensureGradient = (h: number): CanvasPattern | CanvasGradient => {
      const grad = ctx2d.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, '#22c55e');
      grad.addColorStop(0.6, '#22c55e');
      grad.addColorStop(0.78, '#facc15');
      grad.addColorStop(0.95, '#ef4444');
      grad.addColorStop(1.0, '#ef4444');
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
        gradientCanvas = null;
      }

      // Read levels
      let leftLevel = 0;
      let rightLevel = 0;
      let clipped = false;

      if (masterStage) {
        const meter = engine.getMasterMeter(masterStage);
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
      // Update DOM clip indicator only when state changes
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

      // Draw
      ctx2d.clearRect(0, 0, w, h);
      const grad = ensureGradient(h);

      const drawBar = (bar: BarState, x: number, barW: number) => {
        const levelH = clamp01(bar.level) * h;
        const peakY = clamp01(bar.peakLevel) * h;

        // Background
        ctx2d.fillStyle = '#1a1a1a';
        ctx2d.fillRect(x, 0, barW, h);

        // Level fill with gradient mask
        if (levelH > 0) {
          ctx2d.save();
          ctx2d.beginPath();
          ctx2d.rect(x, h - levelH, barW, levelH);
          ctx2d.clip();
          ctx2d.fillStyle = grad;
          ctx2d.fillRect(x, 0, barW, h);
          ctx2d.restore();
        }

        // Peak hold line
        if (bar.peakLevel > 0.005) {
          const peakYPos = h - peakY;
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
  }, [trackId, masterStage, isStereo, updateBar]);

  const label = masterStage
    ? `Master ${masterStage} level meter`
    : `Mixer level meter for ${trackId}`;
  const clipResetLabel = masterStage
    ? `Reset clip indicator for master ${masterStage}`
    : `Reset clip indicator for ${trackId}`;

  const resetClip = () => {
    const engine = getAudioEngine();
    if (masterStage) {
      engine.resetMasterClip(masterStage);
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
      style={{ width: totalWidth + 6 }}
      data-testid="level-meter"
    >
      <button
        type="button"
        data-clip-btn
        aria-label={clipResetLabel}
        className="absolute left-1/2 top-1 z-10 -translate-x-1/2 rounded-full border border-red-200/40 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.75)]"
        style={{ width: CLIP_INDICATOR_SIZE, height: CLIP_INDICATOR_SIZE, display: 'none' }}
        onClick={resetClip}
        title="Reset clip indicator"
      />
      <canvas
        ref={canvasRef}
        aria-label={label}
        data-testid="meter-canvas"
        className="absolute inset-y-0 left-[3px] rounded-sm"
        style={{ width: totalWidth, height: '100%' }}
      />
    </div>
  );
}
