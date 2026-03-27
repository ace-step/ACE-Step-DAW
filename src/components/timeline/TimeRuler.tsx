import { useCallback, useMemo, useRef, memo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useTransportStore } from '../../store/transportStore';
import { useTransport } from '../../hooks/useTransport';
import { getBarDuration, getBeatDuration, snapToGrid } from '../../utils/time';
import { beatToTime, getBeatAtBar, getTimeSignatureAtBar, getTimeSignatureBeatLength } from '../../utils/tempoMap';
import { TIMELINE_RULER_HEIGHT } from './timelineLayout';
import { getTimelineVisualDuration } from '../../utils/timelineZoom';
import { DEFAULT_MEASURES } from '../../constants/defaults';
import { CURSOR_BRACKET_LEFT, CURSOR_BRACKET_RIGHT } from '../../utils/bracketCursor';
import { PunchMarkers } from './PunchMarkers';

const LOOP_MIN_DURATION = 0.01;
const LOOP_HANDLE_WIDTH = 10;
const PLAYHEAD_LOOP_DRAG_THRESHOLD_PX = 4;
/** Minimum pixel distance before a click becomes a drag */
const DRAG_THRESHOLD_PX = 3;

export function TimeRuler() {
  const hasProject = useProjectStore((s) => Boolean(s.project));
  const totalDuration = useProjectStore((s) => s.project?.totalDuration ?? 0);
  const bpm = useProjectStore((s) => s.project?.bpm ?? 120);
  const timeSignature = useProjectStore((s) => s.project?.timeSignature ?? 4);
  const timeSignatureDenominator = useProjectStore((s) => s.project?.timeSignatureDenominator ?? 4);
  const tempoMap = useProjectStore((s) => s.project?.tempoMap);
  const timeSignatureMap = useProjectStore((s) => s.project?.timeSignatureMap);
  const measures = useProjectStore((s) => s.project?.measures ?? DEFAULT_MEASURES);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const timelineViewportWidth = useUIStore((s) => s.timelineViewportWidth);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const loopEnabled = useTransportStore((s) => s.loopEnabled);
  const loopStart = useTransportStore((s) => s.loopStart);
  const loopEnd = useTransportStore((s) => s.loopEnd);
  const setLoopRegion = useTransportStore((s) => s.setLoopRegion);
  const currentTime = useTransportStore((s) => s.currentTime);
  const { seek: transportSeek } = useTransport();

  /** Tracks click-vs-drag state for ruler interactions */
  const rulerDragRef = useRef<{
    startX: number;
    startTime: number;
    isDragging: boolean;
    pointerId: number;
  } | null>(null);

  const loopDragRef = useRef<{
    kind: 'start' | 'end' | 'move';
    pointerId: number;
    originX: number;
    startLoopStart: number;
    startLoopEnd: number;
  } | null>(null);

  const getTimeFromX = useCallback((clientX: number, container: HTMLElement) => {
    if (!hasProject) return;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.max(0, Math.min(x / pixelsPerSecond, totalDuration));
  }, [hasProject, pixelsPerSecond, totalDuration]);

  /** Click = silent seek; drag = create loop region (no audio scrub) */
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!hasProject || e.button !== 0) return;
    e.preventDefault();
    const container = e.currentTarget;
    const time = getTimeFromX(e.clientX, container);
    if (time === undefined) return;

    // During playback, use transportSeek which stops+restarts the audio engine
    // at the new position. Without this, the engine's RAF loop immediately
    // overwrites currentTime back to the old offset (#994).
    if (isPlaying) {
      transportSeek(time);
    } else {
      // Silent seek — no audio engine calls needed when paused
      useTransportStore.getState().seek(time);
    }

    rulerDragRef.current = {
      startX: e.clientX,
      startTime: time,
      isDragging: false,
      pointerId: e.pointerId,
    };

    if ('setPointerCapture' in container) {
      container.setPointerCapture(e.pointerId);
    }
  }, [getTimeFromX, hasProject, isPlaying, transportSeek]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!hasProject || !rulerDragRef.current) return;
    const drag = rulerDragRef.current;
    const container = e.currentTarget;
    const currentX = e.clientX;

    // Check if we've exceeded the drag threshold
    if (!drag.isDragging && Math.abs(currentX - drag.startX) < DRAG_THRESHOLD_PX) return;

    drag.isDragging = true;

    const time = getTimeFromX(currentX, container);
    if (time === undefined) return;

    // Set loop region between start and current position
    const regionStart = Math.min(drag.startTime, time);
    const regionEnd = Math.max(drag.startTime, time);
    setLoopRegion(regionStart, regionEnd);

    // Enable loop if not already
    if (!useTransportStore.getState().loopEnabled) {
      useTransportStore.setState({ loopEnabled: true });
    }
  }, [getTimeFromX, hasProject, setLoopRegion]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!rulerDragRef.current) return;
    const drag = rulerDragRef.current;
    rulerDragRef.current = null;

    // If it was a click (not drag) inside an existing loop region, clear the loop
    if (!drag.isDragging) {
      const { loopEnabled: isLooped, loopStart: ls, loopEnd: le } = useTransportStore.getState();
      if (isLooped && drag.startTime >= ls && drag.startTime <= le) {
        useTransportStore.setState({ loopEnabled: false });
      }
    }

    const container = e.currentTarget;
    if ('releasePointerCapture' in container && container.hasPointerCapture(e.pointerId)) {
      container.releasePointerCapture(e.pointerId);
    }
  }, []);

  const beginLoopDrag = useCallback((kind: 'start' | 'end' | 'move') => (e: React.PointerEvent<HTMLDivElement>) => {
    if (!hasProject || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    loopDragRef.current = {
      kind,
      pointerId: e.pointerId,
      originX: e.clientX,
      startLoopStart: loopStart,
      startLoopEnd: loopEnd,
    };
    if ('setPointerCapture' in e.currentTarget) {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }, [hasProject, loopEnd, loopStart]);

  const handleLoopDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!hasProject || !loopDragRef.current || loopDragRef.current.pointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();

    const drag = loopDragRef.current;
    const deltaSeconds = (e.clientX - drag.originX) / pixelsPerSecond;

    if (drag.kind === 'move') {
      const duration = drag.startLoopEnd - drag.startLoopStart;
      const nextStart = Math.max(0, Math.min(drag.startLoopStart + deltaSeconds, totalDuration - duration));
      setLoopRegion(nextStart, nextStart + duration);
      return;
    }

    if (drag.kind === 'start') {
      const nextStart = Math.max(0, Math.min(drag.startLoopStart + deltaSeconds, drag.startLoopEnd - LOOP_MIN_DURATION));
      setLoopRegion(nextStart, drag.startLoopEnd);
      return;
    }

    const nextEnd = Math.max(drag.startLoopStart + LOOP_MIN_DURATION, Math.min(drag.startLoopEnd + deltaSeconds, totalDuration));
    setLoopRegion(drag.startLoopStart, nextEnd);
  }, [hasProject, pixelsPerSecond, setLoopRegion, totalDuration]);

  const endLoopDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!loopDragRef.current || loopDragRef.current.pointerId !== e.pointerId) return;
    loopDragRef.current = null;
    if ('releasePointerCapture' in e.currentTarget && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  const markers = useMemo(() => {
    if (!hasProject) return [];
    const visualDuration = getTimelineVisualDuration(totalDuration, pixelsPerSecond, timelineViewportWidth);
    const visibleDuration = Math.min(visualDuration, totalDuration);
    const hasTempoMap = tempoMap && tempoMap.length > 0;
    const hasTsMap = timeSignatureMap && timeSignatureMap.length > 0;
    const beatDur = getBeatDuration(bpm) * getTimeSignatureBeatLength(timeSignatureDenominator);
    const beatPx = beatDur * pixelsPerSecond;
    // Show beat subdivisions when zoomed in enough
    const showBeats = beatPx >= 20;

    if (!hasTempoMap && !hasTsMap) {
      const barDur = getBarDuration(bpm, timeSignature, timeSignatureDenominator);
      const result: { label: string; x: number; isBar: boolean; tsLabel?: string }[] = [];
      for (let bar = 1; bar <= measures; bar++) {
        const barTime = (bar - 1) * barDur;
        if (barTime > visibleDuration) break;
        result.push({ label: String(bar), x: barTime * pixelsPerSecond, isBar: true });
        if (showBeats) {
          for (let beat = 2; beat <= timeSignature; beat++) {
            const beatTime = barTime + (beat - 1) * beatDur;
            if (beatTime > visibleDuration) break;
            result.push({ label: `${bar}.${beat}`, x: beatTime * pixelsPerSecond, isBar: false });
          }
        }
      }
      return result;
    }

    const result: { label: string; x: number; isBar: boolean; tsLabel?: string }[] = [];
    let prevTs = '';
    for (let bar = 1; bar <= measures; bar++) {
      const barBeat = getBeatAtBar(bar, timeSignatureMap, timeSignature, timeSignatureDenominator);
      const time = beatToTime(barBeat, tempoMap, bpm);
      if (time > visibleDuration) break;

      let tsLabel: string | undefined;
      if (hasTsMap) {
        const ts = getTimeSignatureAtBar(timeSignatureMap, bar, timeSignature, timeSignatureDenominator);
        const label = `${ts.numerator}/${ts.denominator}`;
        if (label !== prevTs) {
          tsLabel = label;
          prevTs = label;
        }
      }
      result.push({ label: String(bar), x: time * pixelsPerSecond, isBar: true, tsLabel });
      if (showBeats) {
        const ts = hasTsMap
          ? getTimeSignatureAtBar(timeSignatureMap, bar, timeSignature, timeSignatureDenominator)
          : { numerator: timeSignature, denominator: timeSignatureDenominator };
        const beatLength = getTimeSignatureBeatLength(ts.denominator);
        for (let beat = 2; beat <= ts.numerator; beat++) {
          const beatTime = beatToTime(barBeat + ((beat - 1) * beatLength), tempoMap, bpm);
          if (beatTime > visibleDuration) break;
          result.push({ label: `${bar}.${beat}`, x: beatTime * pixelsPerSecond, isBar: false });
        }
      }
    }
    return result;
  }, [bpm, hasProject, measures, pixelsPerSecond, tempoMap, timeSignature, timeSignatureDenominator, timeSignatureMap, timelineViewportWidth, totalDuration]);

  if (!hasProject) return <div className="bg-[#1a1c20] border-b border-[color:var(--color-daw-grid-bar)]" style={{ height: TIMELINE_RULER_HEIGHT }} />;

  const visualDuration = getTimelineVisualDuration(totalDuration, pixelsPerSecond, timelineViewportWidth);
  const totalWidth = visualDuration * pixelsPerSecond;

  return (
    <div
      className="relative bg-[#1a1c20] border-b border-[color:var(--color-daw-grid-bar)] select-none cursor-pointer z-30"
      style={{ width: totalWidth, height: TIMELINE_RULER_HEIGHT }}
      role="slider"
      aria-label="Timeline ruler — click to seek, drag to select loop region"
      aria-valuemin={0}
      aria-valuemax={totalDuration}
      aria-valuenow={currentTime}
      aria-valuetext={`${currentTime.toFixed(2)} seconds`}
      tabIndex={0}
      data-timeline-scrubber="true"
      data-testid="timeline-scrub-ruler"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Cycle/loop region (yellow strip, GarageBand style) */}
      {loopEnabled && loopEnd > loopStart && (
        <div
          className="absolute top-0 h-full"
          data-testid="timeline-loop-region"
          style={{
            left: loopStart * pixelsPerSecond,
            width: (loopEnd - loopStart) * pixelsPerSecond,
            background: 'linear-gradient(180deg, rgba(234,179,8,0.35) 0%, rgba(234,179,8,0.15) 100%)',
            borderLeft: '1px solid rgba(234,179,8,0.5)',
            borderRight: '1px solid rgba(234,179,8,0.5)',
          }}
        >
          <div
            className="absolute inset-y-0 left-0 bg-amber-300/20 hover:bg-amber-300/35"
            style={{ width: LOOP_HANDLE_WIDTH, transform: 'translateX(-50%)', cursor: CURSOR_BRACKET_LEFT }}
            role="slider"
            aria-label="Adjust loop start"
            aria-valuemin={0}
            aria-valuemax={loopEnd}
            aria-valuenow={loopStart}
            data-testid="timeline-loop-start-handle"
            onPointerDown={beginLoopDrag('start')}
            onPointerMove={handleLoopDrag}
            onPointerUp={endLoopDrag}
            onPointerCancel={endLoopDrag}
          />
          <div
            className="absolute inset-y-0 right-0 bg-amber-300/20 hover:bg-amber-300/35"
            style={{ width: LOOP_HANDLE_WIDTH, transform: 'translateX(50%)', cursor: CURSOR_BRACKET_RIGHT }}
            role="slider"
            aria-label="Adjust loop end"
            aria-valuemin={loopStart}
            aria-valuemax={totalDuration}
            aria-valuenow={loopEnd}
            data-testid="timeline-loop-end-handle"
            onPointerDown={beginLoopDrag('end')}
            onPointerMove={handleLoopDrag}
            onPointerUp={endLoopDrag}
            onPointerCancel={endLoopDrag}
          />
          <div
            className="absolute inset-y-0 left-2 right-2 cursor-grab active:cursor-grabbing"
            aria-label="Move loop region"
            data-testid="timeline-loop-move-handle"
            onPointerDown={beginLoopDrag('move')}
            onPointerMove={handleLoopDrag}
            onPointerUp={endLoopDrag}
            onPointerCancel={endLoopDrag}
          />
        </div>
      )}

      {/* Bar and beat markers — labels at top, tick marks extend down */}
      {markers.map(({ label, x, isBar, tsLabel }) => (
        <div
          key={label}
          className="absolute top-0 h-full pointer-events-none"
          style={{ left: x }}
        >
          {/* Vertical tick line — bar: full height from top; beat: short tick from bottom */}
          <div className={`absolute w-px z-10 ${isBar ? 'top-0 h-full bg-[color:var(--color-daw-grid-bar)]' : 'bottom-0 h-[6px] bg-[color:var(--color-daw-grid-beat)]'}`} />
          {/* Label beside tick */}
          <span
            className={`absolute bottom-px left-[4px] font-medium leading-none whitespace-nowrap z-0 ${isBar ? 'text-[10px] text-zinc-400/80' : 'text-[9px] text-zinc-500/60'}`}
          >
            {label}
            {tsLabel && (
              <span className="text-[8px] text-amber-400/60 ml-0.5">{tsLabel}</span>
            )}
          </span>
        </div>
      ))}

      {/* Punch-in/out markers */}
      <PunchMarkers />

      {/* Playhead triangle indicator in ruler */}
      <PlayheadRulerIndicator pixelsPerSecond={pixelsPerSecond} />
    </div>
  );
}

/** Playhead position indicator rendered inside the ruler bar.
 *  Always positioned at playStartTime (the user's click anchor).
 *  Blinks when stopped and timeline is focused. */
const PlayheadRulerIndicator = memo(function PlayheadRulerIndicator({ pixelsPerSecond }: { pixelsPerSecond: number }) {
  const playStartTime = useTransportStore((s) => s.playStartTime);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const setLoopRegion = useTransportStore((s) => s.setLoopRegion);
  const timelineFocused = useUIStore((s) => s.timelineFocused);
  const hasProject = useProjectStore((s) => Boolean(s.project));
  const totalDuration = useProjectStore((s) => s.project?.totalDuration ?? 0);
  const bpm = useProjectStore((s) => s.project?.bpm ?? 120);
  const tempoMap = useProjectStore((s) => s.project?.tempoMap);
  // Triangle always stays at the anchor position (playStartTime)
  const x = playStartTime * pixelsPerSecond;
  const blinking = !isPlaying && timelineFocused;

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !hasProject) return;

    event.preventDefault();
    event.stopPropagation();

    const originX = event.clientX;
    let hasDragged = false;

    const updateLoopRegionFromPointer = (clientX: number, altKey: boolean) => {
      const deltaTime = (clientX - originX) / pixelsPerSecond;
      const rawEnd = Math.max(0, Math.min(totalDuration, playStartTime + deltaTime));
      const snappedEnd = altKey ? rawEnd : snapToGrid(rawEnd, bpm, 1, tempoMap ?? []);
      const start = Math.min(playStartTime, snappedEnd);
      const end = Math.max(playStartTime, snappedEnd);
      if (end - start < LOOP_MIN_DURATION) return;
      setLoopRegion(start, end);
      useTransportStore.setState({ loopEnabled: true });
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - originX;
      if (!hasDragged && Math.abs(deltaX) < PLAYHEAD_LOOP_DRAG_THRESHOLD_PX) return;
      hasDragged = true;
      updateLoopRegionFromPointer(moveEvent.clientX, moveEvent.altKey);
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (!hasDragged) return;
      updateLoopRegionFromPointer(upEvent.clientX, upEvent.altKey);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [bpm, hasProject, pixelsPerSecond, playStartTime, setLoopRegion, tempoMap, totalDuration]);

  // SVG inverted equilateral triangle with crisp 1px white stroke.
  // Odd width (13px) so center pixel aligns with the 1px playhead line.
  // Inset polygon by 0.5px to keep stroke within SVG bounds.
  const svgW = 13;
  const svgH = 12;
  return (
    <div
      className="absolute bottom-[-1px] z-30 h-full w-5"
      style={{ left: x, transform: 'translateX(-50%)', cursor: CURSOR_BRACKET_RIGHT }}
      onPointerDown={handlePointerDown}
      data-testid="timeline-playhead-loop-handle"
    >
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        className={blinking ? 'playhead-triangle-blink' : undefined}
        style={{ display: 'block', margin: 'auto', pointerEvents: 'none' }}
      >
        <polygon
          points={`0.5,0.5 ${svgW - 0.5},0.5 ${svgW / 2},${svgH - 0.5}`}
          fill={blinking ? undefined : '#000000'}
          stroke="white"
          strokeWidth="1"
          strokeLinejoin="miter"
        />
      </svg>
    </div>
  );
});
