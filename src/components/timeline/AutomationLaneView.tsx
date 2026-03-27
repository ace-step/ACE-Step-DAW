import { useState, useRef, useCallback, useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import type { AutomationLane, AutomationParameter, AutomationPoint, AutomationCurveType, AutomationRecordingMode, LFOShape } from '../../types/project';
import { getEffectAutomationColor, getEffectAutomationLabel } from '../../utils/effectAutomation';
import { getTimelineVisualDuration } from '../../utils/timelineZoom';

const LANE_HEIGHT = 60;
const POINT_RADIUS = 4;

const RECORDING_MODES: { value: AutomationRecordingMode; label: string }[] = [
  { value: 'touch', label: 'Touch' },
  { value: 'latch', label: 'Latch' },
  { value: 'write', label: 'Write' },
];

const CURVE_TYPES: { value: AutomationCurveType; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'exponential', label: 'Exp' },
  { value: 's-curve', label: 'S-Curve' },
  { value: 'step', label: 'Step' },
];

/** Build an SVG path segment between two points respecting the curve type of the source point. */
function buildCurveSegment(
  x0: number, y0: number,
  x1: number, y1: number,
  curveType: AutomationCurveType | undefined,
): string {
  const ct = curveType ?? 'linear';
  switch (ct) {
    case 'step':
      return ` L ${x1} ${y0} L ${x1} ${y1}`;
    case 'exponential': {
      const cx = x0 + (x1 - x0) * 0.8;
      return ` Q ${cx} ${y0} ${x1} ${y1}`;
    }
    case 's-curve': {
      const midX = (x0 + x1) / 2;
      return ` C ${midX} ${y0} ${midX} ${y1} ${x1} ${y1}`;
    }
    case 'linear':
    default:
      return ` L ${x1} ${y1}`;
  }
}

interface AutomationLaneViewProps {
  trackId: string;
  lane: AutomationLane;
}

export function AutomationLaneView({ trackId, lane }: AutomationLaneViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const timelineViewportWidth = useUIStore((s) => s.timelineViewportWidth);
  const totalDuration = useProjectStore((s) => s.project?.totalDuration ?? 30);
  const addAutomationPoint = useProjectStore((s) => s.addAutomationPoint);
  const updateAutomationPoint = useProjectStore((s) => s.updateAutomationPoint);
  const removeAutomationPoint = useProjectStore((s) => s.removeAutomationPoint);
  const setAutomationPointCurve = useProjectStore((s) => s.setAutomationPointCurve);
  const setAutomationRecordingMode = useProjectStore((s) => s.setAutomationRecordingMode);
  const generateLFOAutomation = useProjectStore((s) => s.generateLFOAutomation);
  const bpm = useProjectStore((s) => s.project?.bpm ?? 120);
  const effect = useProjectStore((s) =>
    s.project?.tracks.find((track) => track.id === trackId)?.effects?.find((trackEffect) =>
      lane.parameter.type === 'effect' && trackEffect.id === lane.parameter.effectId,
    ) ?? null,
  );
  const sendReturnName = useProjectStore((s) => {
    if (lane.parameter.type !== 'send') return null;
    const track = s.project?.tracks.find((t) => t.id === trackId);
    const send = track?.sends?.[lane.parameter.sendIndex];
    if (!send) return null;
    const rt = (s.project?.returnTracks ?? []).find((r) => r.id === send.returnTrackId);
    return rt?.name ?? null;
  });

  const [showLFODialog, setShowLFODialog] = useState(false);
  const [lfoShape, setLfoShape] = useState<LFOShape>('sine');
  const [lfoRate, setLfoRate] = useState(1);
  const [lfoDepth, setLfoDepth] = useState(1);
  const [lfoPhase, setLfoPhase] = useState(0);

  const color = getEffectAutomationColor(lane.parameter);
  const width = getTimelineVisualDuration(totalDuration, pixelsPerSecond, timelineViewportWidth) * pixelsPerSecond;

  const timeToX = useCallback((time: number) => time * pixelsPerSecond, [pixelsPerSecond]);
  const valueToY = useCallback((value: number) => LANE_HEIGHT - value * LANE_HEIGHT, []);
  const xToTime = useCallback((x: number) => Math.max(0, x / pixelsPerSecond), [pixelsPerSecond]);
  const yToValue = useCallback((y: number) => Math.max(0, Math.min(1, (LANE_HEIGHT - y) / LANE_HEIGHT)), []);

  // Build SVG path from points with curve type support
  const pathD = useMemo(() => {
    if (lane.points.length === 0) return '';
    const pts = lane.points;
    let d = `M ${timeToX(pts[0].time)} ${valueToY(pts[0].value)}`;
    for (let i = 1; i < pts.length; i++) {
      d += buildCurveSegment(
        timeToX(pts[i - 1].time), valueToY(pts[i - 1].value),
        timeToX(pts[i].time), valueToY(pts[i].value),
        pts[i - 1].curveType,
      );
    }
    return d;
  }, [lane.points, timeToX, valueToY]);

  // Fill path (closed to bottom) with curve type support
  const fillD = useMemo(() => {
    if (lane.points.length === 0) return '';
    const pts = lane.points;
    let d = `M ${timeToX(pts[0].time)} ${LANE_HEIGHT}`;
    d += ` L ${timeToX(pts[0].time)} ${valueToY(pts[0].value)}`;
    for (let i = 1; i < pts.length; i++) {
      d += buildCurveSegment(
        timeToX(pts[i - 1].time), valueToY(pts[i - 1].value),
        timeToX(pts[i].time), valueToY(pts[i].value),
        pts[i - 1].curveType,
      );
    }
    d += ` L ${timeToX(pts[pts.length - 1].time)} ${LANE_HEIGHT} Z`;
    return d;
  }, [lane.points, timeToX, valueToY]);

  const paramLabel = lane.parameter.type === 'mixer'
    ? lane.parameter.param.charAt(0).toUpperCase() + lane.parameter.param.slice(1)
    : lane.parameter.type === 'send'
      ? `Send ${lane.parameter.sendIndex + 1}${sendReturnName ? ` (${sendReturnName})` : ''} • Amount`
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

  const handleRecordingModeChange = useCallback((mode: AutomationRecordingMode) => {
    setAutomationRecordingMode(trackId, lane.parameter, mode);
  }, [trackId, lane.parameter, setAutomationRecordingMode]);

  const handleCurveTypeChange = useCallback((pointIndex: number, curveType: AutomationCurveType) => {
    setAutomationPointCurve(trackId, lane.parameter, pointIndex, curveType);
  }, [trackId, lane.parameter, setAutomationPointCurve]);

  const handleLFOGenerate = useCallback(() => {
    const totalBeats = (totalDuration / 60) * bpm;
    generateLFOAutomation(trackId, lane.parameter, {
      shape: lfoShape,
      rate: lfoRate,
      depth: lfoDepth,
      phase: lfoPhase,
      startBeat: 0,
      endBeat: totalBeats,
    });
    setShowLFODialog(false);
  }, [trackId, lane.parameter, totalDuration, bpm, lfoShape, lfoRate, lfoDepth, lfoPhase, generateLFOAutomation]);

  const currentMode = lane.recordingMode ?? 'touch';

  return (
    <div
      className="relative border-t border-white/5"
      style={{ height: LANE_HEIGHT, background: 'rgba(0,0,0,0.15)' }}
    >
      {/* Label + controls */}
      <div
        className="absolute left-1 top-0.5 text-[10px] font-mono select-none z-10 flex items-center gap-1.5"
        style={{ color }}
      >
        <span className="opacity-50 pointer-events-none">{paramLabel}</span>

        {/* Recording mode selector */}
        <select
          className="bg-white/5 border border-white/10 rounded text-[9px] px-0.5 py-0 cursor-pointer"
          style={{ color }}
          value={currentMode}
          onChange={(e) => handleRecordingModeChange(e.target.value as AutomationRecordingMode)}
          title="Automation recording mode"
        >
          {RECORDING_MODES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>

        {/* LFO tool button */}
        <button
          className="bg-white/5 border border-white/10 rounded text-[9px] px-1 py-0 cursor-pointer hover:bg-white/10"
          style={{ color }}
          onClick={() => setShowLFODialog(true)}
          title="Generate LFO automation"
        >
          LFO
        </button>
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
            onClick={(e) => {
              if (e.altKey) {
                e.stopPropagation();
                // Cycle through curve types on Alt+click
                const currentCurve = pt.curveType ?? 'linear';
                const idx = CURVE_TYPES.findIndex((c) => c.value === currentCurve);
                const nextCurve = CURVE_TYPES[(idx + 1) % CURVE_TYPES.length].value;
                handleCurveTypeChange(i, nextCurve);
              }
            }}
          >
            <title>{`${paramLabel}: ${(pt.value * 100).toFixed(0)}% @ ${pt.time.toFixed(2)}s [${pt.curveType ?? 'linear'}]`}</title>
          </circle>
        ))}
      </svg>

      {/* Grid lines (0%, 50%, 100%) */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute w-full" style={{ top: 0, height: 1, background: 'rgba(255,255,255,0.05)' }} />
        <div className="absolute w-full" style={{ top: LANE_HEIGHT / 2, height: 1, background: 'rgba(255,255,255,0.05)' }} />
        <div className="absolute w-full" style={{ top: LANE_HEIGHT - 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
      </div>

      {/* LFO Dialog */}
      {showLFODialog && (
        <div
          className="absolute z-50 left-24 top-0 bg-zinc-900 border border-white/10 rounded-lg shadow-xl p-3"
          style={{ minWidth: 220 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[11px] font-semibold text-white/80 mb-2">LFO Generator</div>

          <div className="flex flex-col gap-1.5 text-[10px] text-white/60">
            <label className="flex items-center justify-between">
              Shape
              <select
                className="bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[10px] text-white/80"
                value={lfoShape}
                onChange={(e) => setLfoShape(e.target.value as LFOShape)}
              >
                <option value="sine">Sine</option>
                <option value="triangle">Triangle</option>
                <option value="saw">Saw</option>
                <option value="square">Square</option>
              </select>
            </label>

            <label className="flex items-center justify-between">
              Rate (cycles)
              <input
                type="number"
                className="bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[10px] text-white/80 w-14 text-right"
                min={0.25}
                max={64}
                step={0.25}
                value={lfoRate}
                onChange={(e) => setLfoRate(parseFloat(e.target.value) || 1)}
              />
            </label>

            <label className="flex items-center justify-between">
              Depth
              <input
                type="number"
                className="bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[10px] text-white/80 w-14 text-right"
                min={0}
                max={1}
                step={0.05}
                value={lfoDepth}
                onChange={(e) => setLfoDepth(parseFloat(e.target.value) || 0)}
              />
            </label>

            <label className="flex items-center justify-between">
              Phase (deg)
              <input
                type="number"
                className="bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[10px] text-white/80 w-14 text-right"
                min={0}
                max={360}
                step={15}
                value={lfoPhase}
                onChange={(e) => setLfoPhase(parseFloat(e.target.value) || 0)}
              />
            </label>
          </div>

          <div className="flex gap-1.5 mt-2.5">
            <button
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] rounded px-2 py-1 cursor-pointer"
              onClick={handleLFOGenerate}
            >
              Generate
            </button>
            <button
              className="flex-1 bg-white/5 hover:bg-white/10 text-white/60 text-[10px] rounded px-2 py-1 cursor-pointer"
              onClick={() => setShowLFODialog(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
