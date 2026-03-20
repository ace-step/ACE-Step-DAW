import { useRef, useCallback, useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { MIN_BPM, MAX_BPM } from '../../constants/defaults';
import { beatToTime } from '../../utils/tempoMap';
import type { TempoEvent } from '../../types/project';
import { TEMPO_LANE_HEIGHT } from './timelineLayout';

const POINT_RADIUS = 5;
const COLOR = '#f59e0b'; // amber for tempo

/**
 * Tempo lane displayed above the timeline track area.
 * Shows discrete tempo change points and optional linear ramps.
 * Double-click to add a tempo event, right-click a point to remove it.
 */
export function TempoLane() {
  const svgRef = useRef<SVGSVGElement>(null);
  const project = useProjectStore((s) => s.project);
  const addTempoEvent = useProjectStore((s) => s.addTempoEvent);
  const updateTempoEvent = useProjectStore((s) => s.updateTempoEvent);
  const removeTempoEvent = useProjectStore((s) => s.removeTempoEvent);
  const beginDrag = useProjectStore((s) => s.beginDrag);
  const endDrag = useProjectStore((s) => s.endDrag);
  const undo = useProjectStore((s) => s.undo);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);

  const bpm = project?.bpm ?? 120;
  const tempoMap = project?.tempoMap;
  const totalDuration = project?.totalDuration ?? 30;
  const width = totalDuration * pixelsPerSecond;

  const beatToX = useCallback(
    (beat: number) => beatToTime(beat, tempoMap, bpm) * pixelsPerSecond,
    [tempoMap, bpm, pixelsPerSecond],
  );

  const xToBeat = useCallback(
    (x: number) => {
      const time = x / pixelsPerSecond;
      if (!tempoMap || tempoMap.length === 0) {
        return (time / 60) * bpm;
      }
      let lo = 0;
      let hi = bpm * (totalDuration / 60) * 2;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        const t = beatToTime(mid, tempoMap, bpm);
        if (t < time) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    },
    [tempoMap, bpm, pixelsPerSecond, totalDuration],
  );

  const bpmToY = useCallback(
    (v: number) => {
      const ratio = (v - MIN_BPM) / (MAX_BPM - MIN_BPM);
      return TEMPO_LANE_HEIGHT - ratio * TEMPO_LANE_HEIGHT;
    },
    [],
  );

  const yToBpm = useCallback(
    (y: number) => {
      const ratio = Math.max(0, Math.min(1, (TEMPO_LANE_HEIGHT - y) / TEMPO_LANE_HEIGHT));
      return Math.round(MIN_BPM + ratio * (MAX_BPM - MIN_BPM));
    },
    [],
  );

  const renderPoints = useMemo(() => {
    const events = tempoMap ?? [];
    if (events.length === 0) {
      return [
        { x: 0, y: bpmToY(bpm), bpm, beat: 0 },
        { x: width, y: bpmToY(bpm), bpm, beat: -1 },
      ];
    }
    const pts: { x: number; y: number; bpm: number; beat: number }[] = [];

    if (events[0].beat > 0) {
      pts.push({ x: 0, y: bpmToY(bpm), bpm, beat: -1 });
      if (!events[0].ramp) {
        pts.push({ x: beatToX(events[0].beat), y: bpmToY(bpm), bpm, beat: -1 });
      }
    }

    for (const ev of events) {
      pts.push({ x: beatToX(ev.beat), y: bpmToY(ev.bpm), bpm: ev.bpm, beat: ev.beat });
    }

    const lastEv = events[events.length - 1];
    pts.push({ x: width, y: bpmToY(lastEv.bpm), bpm: lastEv.bpm, beat: -1 });

    return pts;
  }, [tempoMap, bpm, bpmToY, beatToX, width]);

  const pathD = useMemo(() => {
    if (renderPoints.length === 0) return '';
    let d = `M ${renderPoints[0].x} ${renderPoints[0].y}`;
    for (let i = 1; i < renderPoints.length; i++) {
      d += ` L ${renderPoints[i].x} ${renderPoints[i].y}`;
    }
    return d;
  }, [renderPoints]);

  const fillD = useMemo(() => {
    if (renderPoints.length === 0) return '';
    let d = `M ${renderPoints[0].x} ${TEMPO_LANE_HEIGHT}`;
    d += ` L ${renderPoints[0].x} ${renderPoints[0].y}`;
    for (let i = 1; i < renderPoints.length; i++) {
      d += ` L ${renderPoints[i].x} ${renderPoints[i].y}`;
    }
    d += ` L ${renderPoints[renderPoints.length - 1].x} ${TEMPO_LANE_HEIGHT} Z`;
    return d;
  }, [renderPoints]);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const beat = Math.max(0, Math.round(xToBeat(x)));
      const newBpm = Math.max(MIN_BPM, Math.min(MAX_BPM, yToBpm(y)));
      addTempoEvent({ beat, bpm: newBpm });
    },
    [xToBeat, yToBpm, addTempoEvent],
  );

  const handlePointMouseDown = useCallback(
    (ev: TempoEvent, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      beginDrag();

      const onMove = (me: MouseEvent) => {
        const y = me.clientY - rect.top;
        const newBpm = Math.max(MIN_BPM, Math.min(MAX_BPM, yToBpm(y)));
        updateTempoEvent(ev.beat, { bpm: newBpm });
      };
      const onKeyDown = (ke: KeyboardEvent) => {
        if (ke.key !== 'Escape') return;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('keydown', onKeyDown);
        endDrag();
        undo();
      };
      const onUp = () => {
        endDrag();
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('keydown', onKeyDown);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      window.addEventListener('keydown', onKeyDown);
    },
    [yToBpm, updateTempoEvent, beginDrag, endDrag, undo],
  );

  const handlePointContextMenu = useCallback(
    (ev: TempoEvent, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      removeTempoEvent(ev.beat);
    },
    [removeTempoEvent],
  );

  const events = tempoMap ?? [];

  return (
    <div
      className="relative border-b border-white/10"
      style={{ height: TEMPO_LANE_HEIGHT, background: 'rgba(245, 158, 11, 0.03)' }}
      data-tempo-lane
    >
      <div className="absolute left-1 top-0.5 text-[9px] font-mono select-none pointer-events-none z-10 text-amber-400/60">
        Tempo
      </div>

      <div className="absolute right-1 top-0 text-[8px] font-mono text-amber-400/30 pointer-events-none select-none">
        {MAX_BPM}
      </div>
      <div className="absolute right-1 bottom-0 text-[8px] font-mono text-amber-400/30 pointer-events-none select-none">
        {MIN_BPM}
      </div>

      <svg
        ref={svgRef}
        width={width}
        height={TEMPO_LANE_HEIGHT}
        className="absolute left-0 top-0"
        onDoubleClick={handleDoubleClick}
        style={{ cursor: 'crosshair' }}
      >
        {fillD && <path d={fillD} fill={COLOR} opacity={0.06} />}
        {pathD && <path d={pathD} fill="none" stroke={COLOR} strokeWidth={1.5} opacity={0.6} />}
        {events.map((ev: TempoEvent) => (
          <circle
            key={ev.beat}
            cx={beatToX(ev.beat)}
            cy={bpmToY(ev.bpm)}
            r={POINT_RADIUS}
            fill={COLOR}
            stroke="white"
            strokeWidth={1}
            style={{ cursor: 'grab' }}
            onMouseDown={(e) => handlePointMouseDown(ev, e)}
            onContextMenu={(e) => handlePointContextMenu(ev, e)}
          >
            <title>{`${ev.bpm} BPM @ beat ${ev.beat}${ev.ramp ? ' (ramp)' : ''}`}</title>
          </circle>
        ))}
      </svg>

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute w-full" style={{ top: 0, height: 1, background: 'rgba(245,158,11,0.08)' }} />
        <div className="absolute w-full" style={{ top: TEMPO_LANE_HEIGHT / 2, height: 1, background: 'rgba(245,158,11,0.05)' }} />
        <div className="absolute w-full" style={{ top: TEMPO_LANE_HEIGHT - 1, height: 1, background: 'rgba(245,158,11,0.08)' }} />
      </div>
    </div>
  );
}
