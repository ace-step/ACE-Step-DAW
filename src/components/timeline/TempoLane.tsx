import { useRef, useCallback, useMemo, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { MIN_BPM, MAX_BPM } from '../../constants/defaults';
import { beatToTime, clampTempoCurve, interpolateTempoRamp } from '../../utils/tempoMap';
import type { TempoEvent } from '../../types/project';
import { TEMPO_LANE_HEIGHT } from './timelineLayout';

const POINT_RADIUS = 5;
const COLOR = '#f59e0b'; // amber for tempo
const CURVE_HANDLE_RADIUS = 6;
const CURVE_DRAG_SCALE = 80;
const CURVE_KEYBOARD_STEP = 0.1;
const CURVE_SAMPLES = 24;

type PathPoint = {
  x: number;
  y: number;
};

type RampSegment = {
  key: string;
  startBeat: number;
  endBeat: number;
  startX: number;
  endX: number;
  pathD: string;
  curve: number;
  handleX: number;
  handleY: number;
};

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
  const [hoveredSegmentKey, setHoveredSegmentKey] = useState<string | null>(null);

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

  const curveToY = useCallback(
    (curve: number) => {
      const normalized = (clampTempoCurve(curve) + 1) / 2;
      return TEMPO_LANE_HEIGHT - normalized * TEMPO_LANE_HEIGHT;
    },
    [],
  );

  const geometry = useMemo(() => {
    const events = tempoMap ?? [];
    const points: PathPoint[] = [];
    const rampSegments: RampSegment[] = [];

    const pushPoint = (point: PathPoint) => {
      const lastPoint = points[points.length - 1];
      if (lastPoint && Math.abs(lastPoint.x - point.x) < 0.001 && Math.abs(lastPoint.y - point.y) < 0.001) {
        return;
      }
      points.push(point);
    };

    const sampleRampPoints = (
      startBeat: number,
      endBeat: number,
      startBpm: number,
      endBpm: number,
      curve: number,
    ) => {
      const sampled: PathPoint[] = [];
      for (let i = 0; i <= CURVE_SAMPLES; i++) {
        const t = i / CURVE_SAMPLES;
        const beat = startBeat + (endBeat - startBeat) * t;
        const segmentBpm = interpolateTempoRamp(startBpm, endBpm, t, curve);
        sampled.push({ x: beatToX(beat), y: bpmToY(segmentBpm) });
      }
      return sampled;
    };

    let previousBeat = 0;
    let previousBpm = bpm;
    pushPoint({ x: 0, y: bpmToY(bpm) });

    if (events.length === 0) {
      pushPoint({ x: width, y: bpmToY(bpm) });
      return { points, rampSegments };
    }

    for (const ev of events) {
      const eventX = beatToX(ev.beat);
      const eventY = bpmToY(ev.bpm);
      const previousX = beatToX(previousBeat);
      const previousY = bpmToY(previousBpm);
      const curve = clampTempoCurve(ev.curve);

      if (ev.beat > previousBeat) {
        if (ev.ramp) {
          const sampled = sampleRampPoints(previousBeat, ev.beat, previousBpm, ev.bpm, curve);
          for (const point of sampled.slice(1)) {
            pushPoint(point);
          }
          const midProgress = 0.5;
          const midBeat = previousBeat + (ev.beat - previousBeat) * midProgress;
          const midBpm = interpolateTempoRamp(previousBpm, ev.bpm, midProgress, curve);
          rampSegments.push({
            key: `${previousBeat}-${ev.beat}`,
            startBeat: previousBeat,
            endBeat: ev.beat,
            startX: previousX,
            endX: eventX,
            pathD: sampled.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' '),
            curve,
            handleX: beatToX(midBeat),
            handleY: bpmToY(midBpm),
          });
        } else {
          pushPoint({ x: eventX, y: previousY });
          pushPoint({ x: eventX, y: eventY });
        }
      } else {
        pushPoint({ x: eventX, y: eventY });
      }

      previousBeat = ev.beat;
      previousBpm = ev.bpm;
    }

    pushPoint({ x: width, y: bpmToY(previousBpm) });

    return { points, rampSegments };
  }, [tempoMap, bpm, bpmToY, beatToX, width]);

  const pathD = useMemo(() => {
    if (geometry.points.length === 0) return '';
    return geometry.points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  }, [geometry.points]);

  const fillD = useMemo(() => {
    if (geometry.points.length === 0) return '';
    const firstPoint = geometry.points[0];
    const lastPoint = geometry.points[geometry.points.length - 1];
    return [
      `M ${firstPoint.x} ${TEMPO_LANE_HEIGHT}`,
      `L ${firstPoint.x} ${firstPoint.y}`,
      ...geometry.points.slice(1).map((point) => `L ${point.x} ${point.y}`),
      `L ${lastPoint.x} ${TEMPO_LANE_HEIGHT}`,
      'Z',
    ].join(' ');
  }, [geometry.points]);

  const handleCurveMouseDown = useCallback(
    (segment: RampSegment, eventBeat: number, e: React.MouseEvent<SVGCircleElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const svg = svgRef.current;
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      const startCurve = segment.curve;
      const startY = e.clientY - rect.top;
      beginDrag();

      const onMove = (me: MouseEvent) => {
        const nextY = me.clientY - rect.top;
        const nextCurve = clampTempoCurve(startCurve + (startY - nextY) / CURVE_DRAG_SCALE);
        updateTempoEvent(eventBeat, { curve: nextCurve, ramp: true });
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
    [beginDrag, endDrag, undo, updateTempoEvent],
  );

  const handleCurveKeyDown = useCallback(
    (eventBeat: number, currentCurve: number, e: React.KeyboardEvent<SVGCircleElement>) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        updateTempoEvent(eventBeat, { curve: clampTempoCurve(currentCurve + CURVE_KEYBOARD_STEP), ramp: true });
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        updateTempoEvent(eventBeat, { curve: clampTempoCurve(currentCurve - CURVE_KEYBOARD_STEP), ramp: true });
        return;
      }
      if (e.key === 'Home' || e.key === 'Enter') {
        e.preventDefault();
        updateTempoEvent(eventBeat, { curve: 0, ramp: true });
      }
    },
    [updateTempoEvent],
  );

  const handleCurveDoubleClick = useCallback(
    (eventBeat: number, e: React.MouseEvent<SVGCircleElement>) => {
      e.preventDefault();
      e.stopPropagation();
      updateTempoEvent(eventBeat, { curve: 0, ramp: true });
    },
    [updateTempoEvent],
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
      <div className="absolute left-1 top-0.5 text-[10px] font-mono select-none pointer-events-none z-10 text-amber-400/60">
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
        {geometry.rampSegments.map((segment) => {
          const eventBeat = segment.endBeat;
          const isVisible = hoveredSegmentKey === segment.key;
          return (
            <g key={segment.key}>
              <path
                d={segment.pathD}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                aria-label={`Tempo ramp segment from beat ${segment.startBeat} to beat ${segment.endBeat}`}
                data-testid={`tempo-ramp-segment-${segment.startBeat}-${segment.endBeat}`}
                onMouseEnter={() => setHoveredSegmentKey(segment.key)}
                onMouseLeave={() => setHoveredSegmentKey((current) => (current === segment.key ? null : current))}
              />
              <line
                x1={segment.handleX}
                y1={segment.handleY}
                x2={segment.handleX}
                y2={curveToY(segment.curve)}
                stroke="rgba(251, 191, 36, 0.55)"
                strokeDasharray="3 3"
                opacity={isVisible ? 1 : 0}
                pointerEvents="none"
              />
              <circle
                cx={segment.handleX}
                cy={segment.handleY}
                r={CURVE_HANDLE_RADIUS}
                fill="rgba(251, 191, 36, 0.9)"
                stroke="white"
                strokeWidth={1}
                role="slider"
                tabIndex={0}
                aria-label={`Tempo curve handle from beat ${segment.startBeat} to beat ${segment.endBeat}`}
                aria-valuemin={-1}
                aria-valuemax={1}
                aria-valuenow={segment.curve}
                data-testid={`tempo-curve-handle-${segment.startBeat}-${segment.endBeat}`}
                style={{
                  cursor: 'ns-resize',
                  opacity: isVisible ? 1 : 0,
                  pointerEvents: isVisible ? 'auto' : 'none',
                }}
                onMouseEnter={() => setHoveredSegmentKey(segment.key)}
                onMouseLeave={() => setHoveredSegmentKey((current) => (current === segment.key ? null : current))}
                onMouseDown={(e) => handleCurveMouseDown(segment, eventBeat, e)}
                onDoubleClick={(e) => handleCurveDoubleClick(eventBeat, e)}
                onKeyDown={(e) => handleCurveKeyDown(eventBeat, segment.curve, e)}
              >
                <title>{`Tempo curve ${segment.curve.toFixed(2)} from beat ${segment.startBeat} to beat ${segment.endBeat}`}</title>
              </circle>
            </g>
          );
        })}
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
