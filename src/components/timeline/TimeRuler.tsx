import { useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useTransportStore } from '../../store/transportStore';
import { useTransport } from '../../hooks/useTransport';
import { getBarDuration } from '../../utils/time';

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

  if (!project) return <div className="h-6 bg-[#333] border-b border-[#2a2a2a]" />;

  const barDuration = getBarDuration(project.bpm, project.timeSignature);
  const totalBars = Math.ceil(project.totalDuration / barDuration);
  const totalWidth = project.totalDuration * pixelsPerSecond;

  const markers: { bar: number; x: number }[] = [];
  for (let bar = 1; bar <= totalBars; bar++) {
    const x = (bar - 1) * barDuration * pixelsPerSecond;
    markers.push({ bar, x });
  }

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
      {markers.map(({ bar, x }) => (
        <div
          key={bar}
          className="absolute top-0 h-full flex items-end pb-0.5 pointer-events-none"
          style={{ left: x }}
        >
          <div className="w-px h-3 bg-[#666] mr-1" />
          <span className="text-[10px] text-zinc-400 font-medium">{bar}</span>
        </div>
      ))}
    </div>
  );
}
