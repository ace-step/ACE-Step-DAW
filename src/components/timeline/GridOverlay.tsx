import { useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { getBeatDuration, getBarDuration } from '../../utils/time';
import { beatToTime, getBeatAtBar, getTimeSignatureAtBar, getTimeSignatureBeatLength } from '../../utils/tempoMap';
import { getTimelineVisualDuration } from '../../utils/timelineZoom';
import { useMetaKeyDown } from '../../hooks/useMetaKeyDown';

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

  const lines = useMemo(() => {
    if (!project) return [];

    const { tempoMap, timeSignatureMap, bpm, timeSignature, totalDuration } = project;
    const visualDuration = getTimelineVisualDuration(totalDuration, pixelsPerSecond, timelineViewportWidth);
    const hasTempoMap = tempoMap && tempoMap.length > 0;
    const hasTsMap = timeSignatureMap && timeSignatureMap.length > 0;

    if (!hasTempoMap && !hasTsMap) {
      // Fast path: constant tempo, constant time signature
      const beatDuration = getBeatDuration(bpm);
      const barDuration = getBarDuration(bpm, timeSignature);
      const eighthDuration = beatDuration * 0.5;
      const beatPx = pixelsPerSecond * (60 / bpm);
      const divisions = getVisibleDivisions(beatPx);
      const finest = Math.min(...divisions);
      const stepDuration = beatDuration * finest;

      const result: { x: number; strength: GridStrength }[] = [];
      for (let t = 0; t <= visualDuration; t += stepDuration) {
        result.push({
          x: t * pixelsPerSecond,
          strength: classifyStrength(t, barDuration, beatDuration, eighthDuration),
        });
      }
      return result;
    }

    // Tempo-map/time-sig-aware path: iterate by bars so mixed meters align cleanly.
    const beatPx = pixelsPerSecond * (60 / bpm);
    const divisions = getVisibleDivisions(beatPx);
    const finest = Math.min(...divisions);
    const result: { x: number; strength: GridStrength }[] = [];

    for (let bar = 1; bar <= 999; bar++) {
      const barBeat = getBeatAtBar(bar, timeSignatureMap, timeSignature);
      const barTime = beatToTime(barBeat, tempoMap, bpm);
      if (barTime > visualDuration) break;

      result.push({ x: barTime * pixelsPerSecond, strength: 'bar' });

      const ts = getTimeSignatureAtBar(timeSignatureMap, bar, timeSignature, 4);
      const beatLength = getTimeSignatureBeatLength(ts.denominator);
      const beatsInBar = ts.numerator;
      const barDurationBeats = beatsInBar * beatLength;

      // Iterate through all subdivisions within this bar
      for (let subBeat = finest; subBeat < barDurationBeats; subBeat += finest) {
        const time = beatToTime(barBeat + subBeat, tempoMap, bpm);
        if (time > visualDuration) break;

        const beatDuration = getBeatDuration(bpm);
        const barDuration = barDurationBeats * beatDuration;
        const eighthDuration = beatDuration * 0.5;
        const relTime = subBeat * beatDuration;
        const strength = classifyStrength(relTime, barDuration, beatDuration, eighthDuration);
        result.push({ x: time * pixelsPerSecond, strength });
      }
    }
    return result;
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
      {lines.map((line, i) => {
        const color = colors[line.strength];
        return (
          <div
            key={i}
            className="absolute top-0 bottom-0"
            data-testid={`grid-line-${line.strength}`}
            style={{
              left: line.x,
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
