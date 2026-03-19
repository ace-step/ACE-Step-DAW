import { useCallback, useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useTransportStore } from '../../store/transportStore';
import { useTransport } from '../../hooks/useTransport';
import { getBarDuration } from '../../utils/time';
import { beatToTime, getBeatAtBar, getTimeSignatureAtBar } from '../../utils/tempoMap';

export function TimeRuler() {
  const project = useProjectStore((s) => s.project);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const loopEnabled = useTransportStore((s) => s.loopEnabled);
  const loopStart = useTransportStore((s) => s.loopStart);
  const loopEnd = useTransportStore((s) => s.loopEnd);
  const { seek } = useTransport();

  const seekFromX = useCallback((clientX: number, container: HTMLElement) => {
    if (!project) return;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const time = Math.max(0, Math.min(x / pixelsPerSecond, project.totalDuration));
    seek(time);
  }, [project, pixelsPerSecond, seek]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!project) return;
    const container = e.currentTarget;
    seekFromX(e.clientX, container);

    const onMouseMove = (ev: MouseEvent) => {
      seekFromX(ev.clientX, container);
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [project, seekFromX]);

  const markers = useMemo(() => {
    if (!project) return [];
    const { tempoMap, timeSignatureMap, bpm, timeSignature, totalDuration } = project;
    const hasTempoMap = tempoMap && tempoMap.length > 0;
    const hasTsMap = timeSignatureMap && timeSignatureMap.length > 0;

    if (!hasTempoMap && !hasTsMap) {
      const barDur = getBarDuration(bpm, timeSignature);
      const totalBars = Math.ceil(totalDuration / barDur);
      const result: { bar: number; x: number; tsLabel?: string }[] = [];
      for (let bar = 1; bar <= totalBars; bar++) {
        result.push({ bar, x: (bar - 1) * barDur * pixelsPerSecond });
      }
      return result;
    }

    const result: { bar: number; x: number; tsLabel?: string }[] = [];
    let prevTs = '';
    for (let bar = 1; bar <= 999; bar++) {
      const barBeat = getBeatAtBar(bar, timeSignatureMap, timeSignature);
      const time = beatToTime(barBeat, tempoMap, bpm);
      if (time > totalDuration) break;

      let tsLabel: string | undefined;
      if (hasTsMap) {
        const ts = getTimeSignatureAtBar(timeSignatureMap, bar, timeSignature, 4);
        const label = `${ts.numerator}/${ts.denominator}`;
        if (label !== prevTs) {
          tsLabel = label;
          prevTs = label;
        }
      }
      result.push({ bar, x: time * pixelsPerSecond, tsLabel });
    }
    return result;
  }, [project, pixelsPerSecond]);

  if (!project) return <div className="h-6 bg-[#333] border-b border-[#2a2a2a]" />;

  const totalWidth = project.totalDuration * pixelsPerSecond;

  return (
    <div
      className="relative h-6 bg-[#353535] border-b border-[#2a2a2a] overflow-hidden select-none cursor-pointer"
      style={{ width: totalWidth }}
      onMouseDown={handleMouseDown}
    >
      {/* Cycle/loop region (yellow strip, GarageBand style) */}
      {loopEnabled && loopEnd > loopStart && (
        <div
          className="absolute top-0 h-full"
          style={{
            left: loopStart * pixelsPerSecond,
            width: (loopEnd - loopStart) * pixelsPerSecond,
            background: 'linear-gradient(180deg, rgba(234,179,8,0.35) 0%, rgba(234,179,8,0.15) 100%)',
            borderLeft: '1px solid rgba(234,179,8,0.5)',
            borderRight: '1px solid rgba(234,179,8,0.5)',
          }}
        />
      )}

      {/* Bar markers */}
      {markers.map(({ bar, x, tsLabel }) => (
        <div
          key={bar}
          className="absolute top-0 h-full flex items-end pb-0.5 pointer-events-none"
          style={{ left: x }}
        >
          <div className="w-px h-3 bg-[#666] mr-1" />
          <span className="text-[10px] text-zinc-400 font-medium">{bar}</span>
          {tsLabel && (
            <span className="text-[8px] text-amber-400/60 ml-0.5">{tsLabel}</span>
          )}
        </div>
      ))}
    </div>
  );
}
