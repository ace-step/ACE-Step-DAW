import { useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { getBeatDuration, getBarDuration } from '../../utils/time';
import { beatToTime, getBeatAtBar, getTimeSignatureAtBar, getTimeSignatureBeatLength } from '../../utils/tempoMap';

/**
 * Adaptive grid: resolution auto-adjusts based on zoom level.
 * Zoomed out → bars only. Zoomed in → 16th notes.
 */
function getGridDivision(pixelsPerSecond: number, bpm: number): { division: number; label: string } {
  const beatPx = pixelsPerSecond * (60 / bpm); // pixels per beat

  if (beatPx >= 80) return { division: 0.25, label: '16th' };  // 16th notes
  if (beatPx >= 40) return { division: 0.5,  label: '8th' };   // 8th notes
  if (beatPx >= 20) return { division: 1,    label: 'beat' };  // quarter notes
  if (beatPx >= 8)  return { division: 2,    label: '2-beat' }; // half notes
  return { division: 4, label: 'bar' };                         // bars only
}

export function GridOverlay() {
  const project = useProjectStore((s) => s.project);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);

  const lines = useMemo(() => {
    if (!project) return [];

    const { tempoMap, timeSignatureMap, bpm, timeSignature, totalDuration } = project;
    const hasTempoMap = tempoMap && tempoMap.length > 0;
    const hasTsMap = timeSignatureMap && timeSignatureMap.length > 0;

    if (!hasTempoMap && !hasTsMap) {
      // Fast path: constant tempo, constant time signature
      const beatDuration = getBeatDuration(bpm);
      const barDuration = getBarDuration(bpm, timeSignature);
      const { division } = getGridDivision(pixelsPerSecond, bpm);
      const stepDuration = beatDuration * division;

      const result: { x: number; strength: 'bar' | 'beat' | 'sub' }[] = [];
      for (let t = 0; t <= totalDuration; t += stepDuration) {
        const isBar = Math.abs(t % barDuration) < 0.001 || Math.abs((t % barDuration) - barDuration) < 0.001;
        const isBeat = Math.abs(t % beatDuration) < 0.001 || Math.abs((t % beatDuration) - beatDuration) < 0.001;
        result.push({
          x: t * pixelsPerSecond,
          strength: isBar ? 'bar' : isBeat ? 'beat' : 'sub',
        });
      }
      return result;
    }

    // Tempo-map/time-sig-aware path: iterate by bars so mixed meters align cleanly.
    const result: { x: number; strength: 'bar' | 'beat' | 'sub' }[] = [];

    for (let bar = 1; bar <= 999; bar++) {
      const barBeat = getBeatAtBar(bar, timeSignatureMap, timeSignature);
      const barTime = beatToTime(barBeat, tempoMap, bpm);
      if (barTime > totalDuration) break;

      result.push({ x: barTime * pixelsPerSecond, strength: 'bar' });

      const ts = getTimeSignatureAtBar(timeSignatureMap, bar, timeSignature, 4);
      const beatLength = getTimeSignatureBeatLength(ts.denominator);
      for (let beat = 1; beat < ts.numerator; beat++) {
        const beatTime = beatToTime(barBeat + beat * beatLength, tempoMap, bpm);
        if (beatTime > totalDuration) break;
        result.push({ x: beatTime * pixelsPerSecond, strength: 'beat' });
      }
    }
    return result;
  }, [project, pixelsPerSecond]);

  if (!project) return null;

  const totalWidth = project.totalDuration * pixelsPerSecond;

  const colors = {
    bar: '#3a3a55',
    beat: '#2e2e45',
  };

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ width: totalWidth }}>
      {lines
        .filter((line) => line.strength !== 'sub')
        .map((line, i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0 w-px"
          style={{
            left: line.x,
            backgroundColor: colors[line.strength as 'bar' | 'beat'],
          }}
        />
      ))}
    </div>
  );
}
