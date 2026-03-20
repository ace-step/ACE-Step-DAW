import { useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { getBeatDuration, getBarDuration } from '../../utils/time';
import { beatToTime, getBeatAtBar } from '../../utils/tempoMap';

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

    // Tempo-map/time-sig-aware path: iterate by beat subdivisions
    const { division } = getGridDivision(pixelsPerSecond, bpm);
    const result: { x: number; strength: 'bar' | 'beat' | 'sub' }[] = [];

    const maxBeat = totalDuration * (300 / 60) * 2; // generous upper bound
    let currentBar = 1;
    let nextBarBeat = getBeatAtBar(2, timeSignatureMap, timeSignature);

    for (let beat = 0; beat < maxBeat; beat += division) {
      const time = beatToTime(beat, tempoMap, bpm);
      if (time > totalDuration) break;

      while (beat >= nextBarBeat) {
        currentBar++;
        nextBarBeat = getBeatAtBar(currentBar + 1, timeSignatureMap, timeSignature);
      }

      const barBeat = getBeatAtBar(currentBar, timeSignatureMap, timeSignature);
      const isBar = Math.abs(beat - barBeat) < 0.001;
      const isBeat = Math.abs(beat - Math.round(beat)) < 0.001;

      result.push({
        x: time * pixelsPerSecond,
        strength: isBar ? 'bar' : isBeat ? 'beat' : 'sub',
      });
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
    <div className="absolute inset-0 pointer-events-none" style={{ width: totalWidth, minHeight: '100vh' }}>
      {lines
        .filter((line) => line.strength !== 'sub')
        .map((line, i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0"
          style={{
            left: line.x,
            width: line.strength === 'bar' ? 1 : 0,
            backgroundColor: line.strength === 'bar' ? colors.bar : undefined,
            borderLeft: line.strength === 'beat' ? `1px dashed ${colors.beat}` : undefined,
          }}
        />
      ))}
    </div>
  );
}
