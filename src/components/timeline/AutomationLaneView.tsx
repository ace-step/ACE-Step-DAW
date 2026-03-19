import { useRef, useCallback, useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import type { AutomationLane, AutomationParameter, AutomationPoint } from '../../types/project';
import { getEffectAutomationColor, getEffectAutomationLabel } from '../../utils/effectAutomation';

const LANE_HEIGHT = 60;
const POINT_RADIUS = 4;
interface AutomationLaneViewProps {
  trackId: string;
  lane: AutomationLane;
}

export function AutomationLaneView({ trackId, lane }: AutomationLaneViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const totalDuration = useProjectStore((s) => s.project?.totalDuration ?? 30);
  const addAutomationPoint = useProjectStore((s) => s.addAutomationPoint);
  const updateAutomationPoint = useProjectStore((s) => s.updateAutomationPoint);
  const removeAutomationPoint = useProjectStore((s) => s.removeAutomationPoint);
  const effect = useProjectStore((s) =>
    s.project?.tracks.find((track) => track.id === trackId)?.effects?.find((trackEffect) =>
      lane.parameter.type === 'effect' && trackEffect.id === lane.parameter.effectId,
    ) ?? null,
  );

  const color = getEffectAutomationColor(lane.parameter);
  const width = totalDuration * pixelsPerSecond;

  const timeToX = useCallback((time: number) => time * pixelsPerSecond, [pixelsPerSecond]);
  const valueToY = useCallback((value: number) => LANE_HEIGHT - value * LANE_HEIGHT, []);
  const xToTime = useCallback((x: number) => Math.max(0, x / pixelsPerSecond), [pixelsPerSecond]);
  const yToValue = useCallback((y: number) => Math.max(0, Math.min(1, (LANE_HEIGHT - y) / LANE_HEIGHT)), []);

  // Build SVG path from points
  const pathD = useMemo(() => {
    if (lane.points.length === 0) return '';
    const pts = lane.points;
    let d = `M ${timeToX(pts[0].time)} ${valueToY(pts[0].value)}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` L ${timeToX(pts[i].time)} ${valueToY(pts[i].value)}`;
    }
    return d;
  }, [lane.points, timeToX, valueToY]);

  // Fill path (closed to bottom)
  const fillD = useMemo(() => {
    if (lane.points.length === 0) return '';
    const pts = lane.points;
    let d = `M ${timeToX(pts[0].time)} ${LANE_HEIGHT}`;
    d += ` L ${timeToX(pts[0].time)} ${valueToY(pts[0].value)}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` L ${timeToX(pts[i].time)} ${valueToY(pts[i].value)}`;
    }
    d += ` L ${timeToX(pts[pts.length - 1].time)} ${LANE_HEIGHT} Z`;
    return d;
  }, [lane.points, timeToX, valueToY]);

  const paramLabel = lane.parameter.type === 'mixer'
    ? lane.parameter.param.charAt(0).toUpperCase() + lane.parameter.param.slice(1)
    : `${effect?.type ?? lane.parameter.effectType} • ${getEffectAutomationLabel(lane.parameter.effectType, lane.parameter.param)}`;

  // Double-click to add a new point
  const handleDoubleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const time = xToTime(x);
    const value = yToValue(y);
    addAutomationPoint(trackId, lane.parameter, { time, value });
  }, [trackId, lane.parameter, xToTime, yToValue, addAutomationPoint]);

  // Drag a point
  const handlePointMouseDown = useCallback((pointIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();

    const onMove = (ev: MouseEvent) => {
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      updateAutomationPoint(trackId, lane.parameter, pointIndex, {
        time: xToTime(x),
        value: yToValue(y),
      });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [trackId, lane.parameter, xToTime, yToValue, updateAutomationPoint]);

  // Right-click to delete a point
  const handlePointContextMenu = useCallback((pointIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    removeAutomationPoint(trackId, lane.parameter, pointIndex);
  }, [trackId, lane.parameter, removeAutomationPoint]);

  return (
    <div
      className="relative border-t border-white/5"
      style={{ height: LANE_HEIGHT, background: 'rgba(0,0,0,0.15)' }}
    >
      {/* Label */}
      <div
        className="absolute left-1 top-0.5 text-[9px] font-mono opacity-50 select-none pointer-events-none z-10"
        style={{ color }}
      >
        {paramLabel}
      </div>

      {/* SVG canvas */}
      <svg
        ref={svgRef}
        width={width}
        height={LANE_HEIGHT}
        className="absolute left-0 top-0"
        onDoubleClick={handleDoubleClick}
        style={{ cursor: 'crosshair' }}
      >
        {/* Fill */}
        {fillD && (
          <path d={fillD} fill={color} opacity={0.08} />
        )}
        {/* Line */}
        {pathD && (
          <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} opacity={0.7} />
        )}
        {/* Points */}
        {lane.points.map((pt, i) => (
          <circle
            key={i}
            cx={timeToX(pt.time)}
            cy={valueToY(pt.value)}
            r={POINT_RADIUS}
            fill={color}
            stroke="white"
            strokeWidth={1}
            style={{ cursor: 'grab' }}
            onMouseDown={(e) => handlePointMouseDown(i, e)}
            onContextMenu={(e) => handlePointContextMenu(i, e)}
          >
            <title>{`${paramLabel}: ${(pt.value * 100).toFixed(0)}% @ ${pt.time.toFixed(2)}s`}</title>
          </circle>
        ))}
      </svg>

      {/* Grid lines (0%, 50%, 100%) */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute w-full" style={{ top: 0, height: 1, background: 'rgba(255,255,255,0.05)' }} />
        <div className="absolute w-full" style={{ top: LANE_HEIGHT / 2, height: 1, background: 'rgba(255,255,255,0.05)' }} />
        <div className="absolute w-full" style={{ top: LANE_HEIGHT - 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
      </div>
    </div>
  );
}
