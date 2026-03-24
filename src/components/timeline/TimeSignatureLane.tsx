import { useCallback, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { beatToTime, getBeatAtBar, getTimeSignatureAtBar } from '../../utils/tempoMap';
import { TIME_SIGNATURE_LANE_HEIGHT } from './timelineLayout';
import { getTimelineVisualDuration } from '../../utils/timelineZoom';

const HOVER_THRESHOLD_PX = 10;
const MARKER_COLOR = '#22c55e';

function parseTimeSignatureInput(value: string | null): { numerator: number; denominator: number } | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d+)(?:\s*\/\s*(\d+))?$/);
  if (!match) return null;

  const numerator = Number.parseInt(match[1], 10);
  const denominator = Number.parseInt(match[2] ?? '4', 10);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || numerator < 1 || denominator < 1) {
    return null;
  }

  return { numerator, denominator };
}

export function TimeSignatureLane() {
  const laneRef = useRef<HTMLDivElement>(null);
  const project = useProjectStore((s) => s.project);
  const addTimeSignatureEvent = useProjectStore((s) => s.addTimeSignatureEvent);
  const updateTimeSignatureEvent = useProjectStore((s) => s.updateTimeSignatureEvent);
  const removeTimeSignatureEvent = useProjectStore((s) => s.removeTimeSignatureEvent);
  const beginDrag = useProjectStore((s) => s.beginDrag);
  const endDrag = useProjectStore((s) => s.endDrag);
  const undo = useProjectStore((s) => s.undo);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const timelineViewportWidth = useUIStore((s) => s.timelineViewportWidth);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  const bpm = project?.bpm ?? 120;
  const tempoMap = project?.tempoMap;
  const timeSignature = project?.timeSignature ?? 4;
  const timeSignatureDenominator = project?.timeSignatureDenominator ?? 4;
  const timeSignatureMap = project?.timeSignatureMap ?? [];
  const totalDuration = project?.totalDuration ?? 0;
  const width = getTimelineVisualDuration(totalDuration, pixelsPerSecond, timelineViewportWidth) * pixelsPerSecond;

  const barStarts = useMemo(() => {
    if (!project) return [];

    const starts: { bar: number; x: number }[] = [];
    for (let bar = 1; bar <= 999; bar++) {
      const beat = getBeatAtBar(bar, timeSignatureMap, timeSignature, timeSignatureDenominator);
      const x = beatToTime(beat, tempoMap, bpm) * pixelsPerSecond;
      if (x > width + HOVER_THRESHOLD_PX) break;
      starts.push({ bar, x });
    }
    return starts;
  }, [bpm, pixelsPerSecond, project, tempoMap, timeSignature, timeSignatureDenominator, timeSignatureMap, width]);

  const markers = useMemo(() => {
    if (!project) return [];

    const firstMarker = getTimeSignatureAtBar(timeSignatureMap, 1, timeSignature, timeSignatureDenominator);
    const rest = timeSignatureMap
      .filter((event) => event.bar !== 1)
      .map((event) => ({ ...event, locked: false }));

    return [
      {
        bar: 1,
        numerator: firstMarker.numerator,
        denominator: firstMarker.denominator,
        locked: true,
      },
      ...rest,
    ];
  }, [project, timeSignature, timeSignatureDenominator, timeSignatureMap]);

  const findClosestBar = useCallback((clientX: number) => {
    const lane = laneRef.current;
    if (!lane || barStarts.length === 0) return null;
    const rect = lane.getBoundingClientRect();
    const x = clientX - rect.left;

    let closest = barStarts[0];
    let minDistance = Math.abs(closest.x - x);
    for (const candidate of barStarts) {
      const distance = Math.abs(candidate.x - x);
      if (distance < minDistance) {
        closest = candidate;
        minDistance = distance;
      }
    }

    return { ...closest, distance: minDistance };
  }, [barStarts]);

  const handleMouseMove = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const closest = findClosestBar(event.clientX);
    if (!closest || closest.distance > HOVER_THRESHOLD_PX) {
      setHoveredBar(null);
      return;
    }
    setHoveredBar(closest.bar);
  }, [findClosestBar]);

  const handleMouseLeave = useCallback(() => {
    setHoveredBar(null);
  }, []);

  const handleAddMarker = useCallback((bar: number) => {
    if (!project) return;
    const current = getTimeSignatureAtBar(timeSignatureMap, bar, timeSignature, timeSignatureDenominator);
    addTimeSignatureEvent({ bar, numerator: current.numerator, denominator: current.denominator });
  }, [addTimeSignatureEvent, project, timeSignature, timeSignatureDenominator, timeSignatureMap]);

  const handleEditMarker = useCallback((bar: number) => {
    if (!project) return;
    const current = getTimeSignatureAtBar(timeSignatureMap, bar, timeSignature, timeSignatureDenominator);
    const parsed = parseTimeSignatureInput(window.prompt('Edit time signature', `${current.numerator}/${current.denominator}`));
    if (!parsed) return;

    if (bar === 1) {
      addTimeSignatureEvent({ bar: 1, ...parsed });
      return;
    }

    updateTimeSignatureEvent(bar, parsed);
  }, [addTimeSignatureEvent, project, timeSignature, timeSignatureDenominator, timeSignatureMap, updateTimeSignatureEvent]);

  const handleMarkerMouseDown = useCallback((bar: number, numerator: number, denominator: number, locked: boolean, event: ReactMouseEvent<HTMLButtonElement>) => {
    if (locked || event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    beginDrag({ scope: 'arrangement', label: 'Move time signature marker' });

    let currentBar = bar;
    const onMove = (moveEvent: MouseEvent) => {
      const closest = findClosestBar(moveEvent.clientX);
      if (!closest) return;
      const nextBar = Math.max(2, closest.bar);
      if (nextBar === currentBar) return;

      addTimeSignatureEvent({ bar: nextBar, numerator, denominator });
      removeTimeSignatureEvent(currentBar);
      currentBar = nextBar;
    };

    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== 'Escape') return;
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
  }, [addTimeSignatureEvent, beginDrag, endDrag, findClosestBar, removeTimeSignatureEvent, undo]);

  const hoveredStart = hoveredBar ? barStarts.find((start) => start.bar === hoveredBar) ?? null : null;
  const showAddButton = hoveredStart && !markers.some((marker) => marker.bar === hoveredStart.bar);

  return (
    <div
      ref={laneRef}
      className="relative border-b border-white/10"
      style={{ height: TIME_SIGNATURE_LANE_HEIGHT, background: 'rgba(34, 197, 94, 0.04)' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className="absolute left-1 top-0.5 text-[10px] font-mono select-none pointer-events-none z-10 text-emerald-400/60">
        Meter
      </div>

      <div
        className="absolute inset-0"
        data-testid="time-signature-lane-hit-area"
      />

      <div className="absolute inset-0">
        {markers.map((marker) => {
          const start = barStarts.find((barStart) => barStart.bar === marker.bar);
          if (!start) return null;

          return (
            <button
              key={`${marker.bar}-${marker.numerator}-${marker.denominator}`}
              type="button"
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded border px-2 py-1 text-[10px] font-mono text-white shadow-sm"
              style={{
                left: start.x,
                background: marker.locked ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.3)',
                borderColor: marker.locked ? 'rgba(167, 243, 208, 0.4)' : 'rgba(34, 197, 94, 0.7)',
                cursor: marker.locked ? 'default' : 'grab',
              }}
              aria-label={`Time signature ${marker.numerator}/${marker.denominator} at bar ${marker.bar}`}
              onDoubleClick={() => handleEditMarker(marker.bar)}
              onMouseDown={(event) => handleMarkerMouseDown(marker.bar, marker.numerator, marker.denominator, marker.locked, event)}
            >
              {marker.numerator}/{marker.denominator}
            </button>
          );
        })}

        {showAddButton && hoveredStart && (
          <button
            type="button"
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-5 w-5 rounded-full border text-[12px] font-semibold leading-none text-white"
            style={{
              left: hoveredStart.x,
              background: MARKER_COLOR,
              borderColor: 'rgba(255,255,255,0.6)',
              boxShadow: '0 0 0 1px rgba(15,23,42,0.4)',
            }}
            aria-label={`Add time signature change at bar ${hoveredStart.bar}`}
            onClick={() => handleAddMarker(hoveredStart.bar)}
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}
