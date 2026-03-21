import { useCallback, useMemo, useRef, memo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useTransportStore } from '../../store/transportStore';
import { useTransport } from '../../hooks/useTransport';
import { getBarDuration, getBeatDuration } from '../../utils/time';
import { beatToTime, getBeatAtBar, getTimeSignatureAtBar } from '../../utils/tempoMap';
import { getScrubPreviewRate } from '../../utils/scrubMath';
import { TIMELINE_RULER_HEIGHT } from './timelineLayout';

const LOOP_MIN_DURATION = 0.01;
const LOOP_HANDLE_WIDTH = 10;

export function TimeRuler() {
  const project = useProjectStore((s) => s.project);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const loopEnabled = useTransportStore((s) => s.loopEnabled);
  const loopStart = useTransportStore((s) => s.loopStart);
  const loopEnd = useTransportStore((s) => s.loopEnd);
  const setLoopRegion = useTransportStore((s) => s.setLoopRegion);
  const isScrubbing = useTransportStore((s) => s.isScrubbing);
  const currentTime = useTransportStore((s) => s.currentTime);
  const { startScrub, scrubTo, endScrub } = useTransport();
  const scrubStateRef = useRef<{ x: number; time: number; stamp: number } | null>(null);
  const loopDragRef = useRef<{
    kind: 'start' | 'end' | 'move';
    pointerId: number;
    originX: number;
    startLoopStart: number;
    startLoopEnd: number;
  } | null>(null);

  const getTimeFromX = useCallback((clientX: number, container: HTMLElement) => {
    if (!project) return;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.max(0, Math.min(x / pixelsPerSecond, project.totalDuration));
  }, [project, pixelsPerSecond]);

  const getPreviewRate = useCallback((nextX: number, nextTime: number, stamp: number) => {
    const prev = scrubStateRef.current;
    if (!prev) return 0;
    return getScrubPreviewRate({
      previousX: prev.x,
      nextX,
      previousTime: prev.time,
      nextTime,
      previousStamp: prev.stamp,
      nextStamp: stamp,
    });
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!project || e.button !== 0) return;
    e.preventDefault();
    const container = e.currentTarget;
    const time = getTimeFromX(e.clientX, container);
    if (time === undefined) return;

    scrubStateRef.current = { x: e.clientX, time, stamp: e.timeStamp };
    void startScrub(time);

    if ('setPointerCapture' in container) {
      container.setPointerCapture(e.pointerId);
    }
  }, [getTimeFromX, project, startScrub]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!project || !isScrubbing) return;
    const container = e.currentTarget;
    const time = getTimeFromX(e.clientX, container);
    if (time === undefined) return;

    const previewRate = getPreviewRate(e.clientX, time, e.timeStamp);
    scrubStateRef.current = { x: e.clientX, time, stamp: e.timeStamp };
    scrubTo(time, previewRate);
  }, [getPreviewRate, getTimeFromX, isScrubbing, project, scrubTo]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbing) return;
    scrubStateRef.current = null;
    endScrub();
    const container = e.currentTarget;
    if ('releasePointerCapture' in container && container.hasPointerCapture(e.pointerId)) {
      container.releasePointerCapture(e.pointerId);
    }
  }, [endScrub, isScrubbing]);

  const beginLoopDrag = useCallback((kind: 'start' | 'end' | 'move') => (e: React.PointerEvent<HTMLDivElement>) => {
    if (!project || e.button !== 0) return;
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
  }, [loopEnd, loopStart, project]);

  const handleLoopDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!project || !loopDragRef.current || loopDragRef.current.pointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();

    const drag = loopDragRef.current;
    const deltaSeconds = (e.clientX - drag.originX) / pixelsPerSecond;

    if (drag.kind === 'move') {
      const duration = drag.startLoopEnd - drag.startLoopStart;
      const nextStart = Math.max(0, Math.min(drag.startLoopStart + deltaSeconds, project.totalDuration - duration));
      setLoopRegion(nextStart, nextStart + duration);
      return;
    }

    if (drag.kind === 'start') {
      const nextStart = Math.max(0, Math.min(drag.startLoopStart + deltaSeconds, drag.startLoopEnd - LOOP_MIN_DURATION));
      setLoopRegion(nextStart, drag.startLoopEnd);
      return;
    }

    const nextEnd = Math.max(drag.startLoopStart + LOOP_MIN_DURATION, Math.min(drag.startLoopEnd + deltaSeconds, project.totalDuration));
    setLoopRegion(drag.startLoopStart, nextEnd);
  }, [pixelsPerSecond, project, setLoopRegion]);

  const endLoopDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!loopDragRef.current || loopDragRef.current.pointerId !== e.pointerId) return;
    loopDragRef.current = null;
    if ('releasePointerCapture' in e.currentTarget && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  const markers = useMemo(() => {
    if (!project) return [];
    const { tempoMap, timeSignatureMap, bpm, timeSignature, totalDuration } = project;
    const hasTempoMap = tempoMap && tempoMap.length > 0;
    const hasTsMap = timeSignatureMap && timeSignatureMap.length > 0;
    const beatDur = getBeatDuration(bpm);
    const beatPx = beatDur * pixelsPerSecond;
    // Show beat subdivisions when zoomed in enough
    const showBeats = beatPx >= 20;

    if (!hasTempoMap && !hasTsMap) {
      const barDur = getBarDuration(bpm, timeSignature);
      const totalBars = Math.ceil(totalDuration / barDur);
      const result: { label: string; x: number; isBar: boolean; tsLabel?: string }[] = [];
      for (let bar = 1; bar <= totalBars; bar++) {
        const barTime = (bar - 1) * barDur;
        result.push({ label: String(bar), x: barTime * pixelsPerSecond, isBar: true });
        if (showBeats) {
          for (let beat = 2; beat <= timeSignature; beat++) {
            const beatTime = barTime + (beat - 1) * beatDur;
            if (beatTime > totalDuration) break;
            result.push({ label: `${bar}.${beat}`, x: beatTime * pixelsPerSecond, isBar: false });
          }
        }
      }
      return result;
    }

    const result: { label: string; x: number; isBar: boolean; tsLabel?: string }[] = [];
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
      result.push({ label: String(bar), x: time * pixelsPerSecond, isBar: true, tsLabel });
      if (showBeats) {
        const ts = hasTsMap
          ? getTimeSignatureAtBar(timeSignatureMap, bar, timeSignature, 4)
          : { numerator: timeSignature, denominator: 4 };
        for (let beat = 2; beat <= ts.numerator; beat++) {
          const beatTime = beatToTime(barBeat + (beat - 1), tempoMap, bpm);
          if (beatTime > totalDuration) break;
          result.push({ label: `${bar}.${beat}`, x: beatTime * pixelsPerSecond, isBar: false });
        }
      }
    }
    return result;
  }, [project, pixelsPerSecond]);

  if (!project) return <div className="bg-[#1a1a28] border-b border-[color:var(--color-daw-grid-bar)]" style={{ height: TIMELINE_RULER_HEIGHT }} />;

  const totalWidth = project.totalDuration * pixelsPerSecond;

  return (
    <div
      className="relative bg-[#1a1a28] border-b border-[color:var(--color-daw-grid-bar)] select-none cursor-pointer z-30"
      style={{ width: totalWidth, height: TIMELINE_RULER_HEIGHT }}
      role="slider"
      aria-label="Timeline scrub ruler"
      aria-valuemin={0}
      aria-valuemax={project.totalDuration}
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
            className="absolute inset-y-0 left-0 cursor-col-resize bg-amber-300/20 hover:bg-amber-300/35"
            style={{ width: LOOP_HANDLE_WIDTH, transform: 'translateX(-50%)' }}
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
            className="absolute inset-y-0 right-0 cursor-col-resize bg-amber-300/20 hover:bg-amber-300/35"
            style={{ width: LOOP_HANDLE_WIDTH, transform: 'translateX(50%)' }}
            role="slider"
            aria-label="Adjust loop end"
            aria-valuemin={loopStart}
            aria-valuemax={project.totalDuration}
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
          {/* Vertical tick line from top */}
          <div className={`absolute top-0 w-px ${isBar ? 'h-full bg-[#5a5a75]' : 'h-2/3 bg-[color:var(--color-daw-grid-bar)]'}`} />
          {/* Label beside tick */}
          <span
            className={`absolute bottom-px left-[4px] font-medium leading-none whitespace-nowrap ${isBar ? 'text-[10px] text-zinc-400/80' : 'text-[9px] text-zinc-500/60'}`}
          >
            {label}
            {tsLabel && (
              <span className="text-[8px] text-amber-400/60 ml-0.5">{tsLabel}</span>
            )}
          </span>
        </div>
      ))}

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
  const timelineFocused = useUIStore((s) => s.timelineFocused);
  // Triangle always stays at the anchor position (playStartTime)
  const x = playStartTime * pixelsPerSecond;
  const blinking = !isPlaying && timelineFocused;

  // SVG inverted equilateral triangle with crisp 1px white stroke.
  // Odd width (13px) so center pixel aligns with the 1px playhead line.
  // Inset polygon by 0.5px to keep stroke within SVG bounds.
  const svgW = 13;
  const svgH = 12;
  return (
    <div
      className="absolute bottom-[-1px] z-30 pointer-events-none"
      style={{ left: x, transform: `translate(-${Math.floor(svgW / 2)}px, 0px)` }}
    >
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        className={blinking ? 'playhead-triangle-blink' : undefined}
        style={{ display: 'block' }}
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
