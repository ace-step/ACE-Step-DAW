import { useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { getBeatDuration, getBarDuration, getEffectiveMeasures } from '../../utils/time';
import { beatToTime, getBeatAtBar, getTimeSignatureAtBar, getTimeSignatureBeatLength } from '../../utils/tempoMap';
import { getTimelineVisualDuration } from '../../utils/timelineZoom';
import { useMetaKeyDown } from '../../hooks/useMetaKeyDown';
import { DEFAULT_MEASURES } from '../../constants/defaults';

/** Grid line hierarchy — coarser levels always visible, finer levels appear as you zoom in. */
type GridStrength = 'bar' | 'beat' | 'eighth' | 'sub';

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

  const { lines, barShading } = useMemo(() => {
    if (!project) return { lines: [], barShading: [] };

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

      const result: { x: number; strength: GridStrength; outOfRange: boolean }[] = [];
      for (let t = 0; t < visibleDuration; t += stepDuration) {
        result.push({
          x: t * pixelsPerSecond,
          strength: classifyStrength(t, barDuration, beatDuration, eighthDuration),
          outOfRange: false,
        });
      }

      // Alternating bar shading — every other bar gets a subtle darker background
      const shading: { x: number; width: number }[] = [];
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
    const result: { x: number; strength: GridStrength; outOfRange: boolean }[] = [];
    const shading: { x: number; width: number }[] = [];

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

  if (!project) return null;

  const totalWidth = getTimelineVisualDuration(project.totalDuration, pixelsPerSecond, timelineViewportWidth) * pixelsPerSecond;

  const colors: Record<GridStrength, string> = {
    bar: 'var(--color-daw-grid-bar)',
    beat: 'var(--color-daw-grid-beat)',
    eighth: 'var(--color-daw-grid-eighth)',
    sub: 'var(--color-daw-grid-sub)',
  };

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ width: totalWidth, minHeight: '100vh' }}>
      {/* Alternating bar shading — every other bar gets a subtle darker background */}
      {barShading.map((shade, i) => (
        <div
          key={`shade-${i}`}
          className="absolute top-0 bottom-0"
          data-testid="grid-bar-shading"
          style={{
            left: shade.x,
            width: shade.width,
            backgroundColor: 'var(--color-daw-grid-bar-shading)',
          }}
        />
      ))}
      {lines.map((line, i) => {
        const color = colors[line.strength];
        return (
          <div
            key={i}
            className="absolute top-0 bottom-0"
            data-testid={`grid-line-${line.strength}`}
            {...(line.outOfRange ? { 'data-out-of-range': 'true' } : {})}
            style={{
              left: line.x,
              opacity: line.outOfRange ? 0.3 : undefined,
              ...(isMetaDown
                ? { borderLeft: `1px dashed ${color}` }
                : { width: 1, backgroundColor: color }),
            }}
          />
        );
      })}
    </div>
  );
}
