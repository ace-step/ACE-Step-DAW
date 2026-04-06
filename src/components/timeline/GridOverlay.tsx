import { useMemo, useRef, useEffect, useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { getBeatDuration, getBarDuration, getEffectiveMeasures } from '../../utils/time';
import { beatToTime, getBeatAtBar, getTimeSignatureAtBar, getTimeSignatureBeatLength } from '../../utils/tempoMap';
import { getTimelineVisualDuration } from '../../utils/timelineZoom';
import { useMetaKeyDown } from '../../hooks/useMetaKeyDown';
import { DEFAULT_MEASURES } from '../../constants/defaults';
import { drawGrid, type GridStrength, type GridLine, type BarShading } from './GridCanvasRenderer';

/**
 * Progressive grid: returns all subdivision levels that should be visible at the current zoom.
 * Each level defines the beat fraction it represents.
 *
 * beatPx thresholds (pixels per beat):
 *   always → bars + beats (quarter notes)
 *   ≥ 80   → + 1/8 note lines
 *   ≥ 160  → + 1/16 note lines
 *   ≥ 320  → + 1/32 note lines
 *   ≥ 640  → + 1/64 note lines
 */
function getVisibleDivisions(beatPx: number): number[] {
  // Always show beats (1.0 = quarter note)
  const divs = [1];
  if (beatPx >= 80)  divs.push(0.5);    // 8th notes
  if (beatPx >= 160) divs.push(0.25);   // 16th notes
  if (beatPx >= 320) divs.push(0.125);  // 32nd notes
  if (beatPx >= 640) divs.push(0.0625); // 64th notes
  return divs;
}

function classifyStrength(t: number, barDuration: number, beatDuration: number, eighthDuration: number): GridStrength {
  const eps = 0.001;
  const isBar = Math.abs(t % barDuration) < eps || Math.abs((t % barDuration) - barDuration) < eps;
  if (isBar) return 'bar';
  const isBeat = Math.abs(t % beatDuration) < eps || Math.abs((t % beatDuration) - beatDuration) < eps;
  if (isBeat) return 'beat';
  const isEighth = Math.abs(t % eighthDuration) < eps || Math.abs((t % eighthDuration) - eighthDuration) < eps;
  if (isEighth) return 'eighth';
  return 'sub';
}

export function GridOverlay() {
  const project = useProjectStore((s) => s.project);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const timelineViewportWidth = useUIStore((s) => s.timelineViewportWidth);
  const isMetaDown = useMetaKeyDown();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { lines, barShading } = useMemo(() => {
    if (!project) return { lines: [] as GridLine[], barShading: [] as BarShading[] };

    const {
      tempoMap,
      timeSignatureMap,
      bpm,
      timeSignature,
      timeSignatureDenominator = 4,
      totalDuration,
    } = project;
    const configuredMeasures = project.measures ?? DEFAULT_MEASURES;
    const effectiveMeasures = getEffectiveMeasures(configuredMeasures, totalDuration, bpm, timeSignature, timeSignatureDenominator);
    const visualDuration = getTimelineVisualDuration(totalDuration, pixelsPerSecond, timelineViewportWidth);
    const hasTempoMap = tempoMap && tempoMap.length > 0;
    const hasTsMap = timeSignatureMap && timeSignatureMap.length > 0;

    // Compute the time boundary for the configured measures
    let measureBoundary: number;
    if (hasTempoMap || hasTsMap) {
      const totalBeats = getBeatAtBar(effectiveMeasures + 1, timeSignatureMap, timeSignature, timeSignatureDenominator);
      measureBoundary = beatToTime(totalBeats, tempoMap, bpm);
    } else {
      measureBoundary = effectiveMeasures * getBarDuration(bpm, timeSignature, timeSignatureDenominator);
    }
    const visibleDuration = Math.min(visualDuration, measureBoundary);

    if (!hasTempoMap && !hasTsMap) {
      // Fast path: constant tempo, constant time signature
      const beatDuration = getBeatDuration(bpm) * getTimeSignatureBeatLength(timeSignatureDenominator);
      const barDuration = getBarDuration(bpm, timeSignature, timeSignatureDenominator);
      const eighthDuration = beatDuration * 0.5;
      const beatPx = pixelsPerSecond * beatDuration;
      const divisions = getVisibleDivisions(beatPx);
      const finest = Math.min(...divisions);
      const stepDuration = beatDuration * finest;

      const result: GridLine[] = [];
      for (let t = 0; t < visibleDuration; t += stepDuration) {
        result.push({
          x: t * pixelsPerSecond,
          strength: classifyStrength(t, barDuration, beatDuration, eighthDuration),
          outOfRange: false,
        });
      }

      // Alternating bar shading — every other bar gets a subtle darker background
      const shading: BarShading[] = [];
      const barWidthPx = barDuration * pixelsPerSecond;
      const totalBars = Math.ceil(visibleDuration / barDuration);
      for (let bar = 0; bar < totalBars; bar++) {
        if (bar % 2 === 1) {
          shading.push({ x: bar * barWidthPx, width: barWidthPx });
        }
      }

      return { lines: result, barShading: shading };
    }

    // Tempo-map/time-sig-aware path: iterate by bars so mixed meters align cleanly.
    const beatPx = pixelsPerSecond * getBeatDuration(bpm) * getTimeSignatureBeatLength(timeSignatureDenominator);
    const divisions = getVisibleDivisions(beatPx);
    const finest = Math.min(...divisions);
    const result: GridLine[] = [];
    const shading: BarShading[] = [];

    for (let bar = 1; bar <= effectiveMeasures; bar++) {
      const barBeat = getBeatAtBar(bar, timeSignatureMap, timeSignature, timeSignatureDenominator);
      const barTime = beatToTime(barBeat, tempoMap, bpm);
      if (barTime > visibleDuration) break;

      result.push({ x: barTime * pixelsPerSecond, strength: 'bar', outOfRange: false });

      const ts = getTimeSignatureAtBar(timeSignatureMap, bar, timeSignature, timeSignatureDenominator);
      const beatLength = getTimeSignatureBeatLength(ts.denominator);
      const beatsInBar = ts.numerator;
      const barDurationBeats = beatsInBar * beatLength;
      const unitDuration = getBeatDuration(bpm) * beatLength;
      const barDuration = beatsInBar * unitDuration;
      const eighthDuration = unitDuration * 0.5;
      const stepBeats = beatLength * finest;

      // Alternating bar shading for tempo-map path
      if (bar % 2 === 0) {
        const nextBarBeat = getBeatAtBar(bar + 1, timeSignatureMap, timeSignature, timeSignatureDenominator);
        const nextBarTime = beatToTime(nextBarBeat, tempoMap, bpm);
        shading.push({
          x: barTime * pixelsPerSecond,
          width: (nextBarTime - barTime) * pixelsPerSecond,
        });
      }

      // Iterate through all subdivisions within this bar
      for (let subBeat = stepBeats; subBeat < barDurationBeats; subBeat += stepBeats) {
        const time = beatToTime(barBeat + subBeat, tempoMap, bpm);
        if (time > visibleDuration) break;

        const relTime = (subBeat / beatLength) * unitDuration;
        const strength = classifyStrength(relTime, barDuration, unitDuration, eighthDuration);
        result.push({ x: time * pixelsPerSecond, strength, outOfRange: false });
      }
    }
    return { lines: result, barShading: shading };
  }, [project, pixelsPerSecond, timelineViewportWidth]);

  const totalWidth = project
    ? getTimelineVisualDuration(project.totalDuration, pixelsPerSecond, timelineViewportWidth) * pixelsPerSecond
    : 0;

  const colors: Record<GridStrength, string> = {
    bar: 'var(--color-daw-grid-bar)',
    beat: 'var(--color-daw-grid-beat)',
    eighth: 'var(--color-daw-grid-eighth)',
    sub: 'var(--color-daw-grid-sub)',
  };

  // Clamp canvas to a safe maximum to avoid exceeding browser canvas limits
  // (typically 16384 or 32768 px). For very long timelines, this prevents
  // blank canvases or crashes from oversized backing stores.
  const MAX_CANVAS_WIDTH = 16384;
  const clampedWidth = Math.min(totalWidth, MAX_CANVAS_WIDTH);

  const renderGrid = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !project) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement?.getBoundingClientRect();
    const h = rect?.height ?? (canvas.offsetHeight || 800);

    canvas.width = clampedWidth * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${clampedWidth}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    // Resolve CSS custom properties to actual color values
    const computedStyle = getComputedStyle(canvas);
    const resolvedColors: Record<GridStrength, string> = {
      bar: computedStyle.getPropertyValue('--color-daw-grid-bar').trim() || 'rgba(255,255,255,0.12)',
      beat: computedStyle.getPropertyValue('--color-daw-grid-beat').trim() || 'rgba(255,255,255,0.06)',
      eighth: computedStyle.getPropertyValue('--color-daw-grid-eighth').trim() || 'rgba(255,255,255,0.04)',
      sub: computedStyle.getPropertyValue('--color-daw-grid-sub').trim() || 'rgba(255,255,255,0.025)',
    };

    const barShadingColor = computedStyle.getPropertyValue('--color-daw-grid-bar-shading').trim()
      || 'rgba(255,255,255,0.02)';

    // Only draw lines within the clamped canvas width
    const visibleLines = clampedWidth < totalWidth
      ? lines.filter((l) => l.x <= clampedWidth)
      : lines;
    const visibleShading = clampedWidth < totalWidth
      ? barShading.filter((s) => s.x < clampedWidth)
      : barShading;

    drawGrid(ctx, {
      lines: visibleLines,
      barShading: visibleShading,
      totalWidth: clampedWidth,
      height: h,
      isDashed: isMetaDown,
      barShadingColor,
      colors: resolvedColors,
    });
  }, [lines, barShading, totalWidth, clampedWidth, isMetaDown, project]);

  useEffect(() => {
    renderGrid();
  }, [renderGrid]);

  // Re-render when the container resizes (track heights change)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas?.parentElement) return;

    const ro = new ResizeObserver(() => renderGrid());
    ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, [renderGrid]);

  if (!project) return null;

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ width: totalWidth, minHeight: '100vh' }}>
      <canvas
        ref={canvasRef}
        data-testid="grid-canvas"
        className="absolute inset-0"
        style={{ width: totalWidth }}
      />
    </div>
  );
}
