import { useCallback, useMemo, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useTransportStore } from '../../store/transportStore';
import { useTransport } from '../../hooks/useTransport';
import { getBarDuration, getBeatDuration, snapToGrid } from '../../utils/time';
import {
  beatToTime,
  getBeatAtBar,
  getTimeSignatureAtBar,
  getTimeSignatureBeatLength,
} from '../../utils/tempoMap';
import { getScrubPreviewRate } from '../../utils/scrubMath';
import { TIMELINE_RULER_HEIGHT } from './timelineLayout';

type LoopDragMode = 'move' | 'start' | 'end';

interface LoopDragState {
  mode: LoopDragMode;
  pointerId: number;
  pointerStartTime: number;
  loopStart: number;
  loopEnd: number;
}

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
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const scrubStateRef = useRef<{ x: number; time: number; stamp: number } | null>(null);
  const loopDragRef = useRef<LoopDragState | null>(null);

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

  const getSnappedTime = useCallback((time: number, altKey: boolean) => {
    if (!project || altKey) return time;
    return snapToGrid(time, project.bpm, 1, project.tempoMap);
  }, [project]);

  const clampLoopRange = useCallback((start: number, end: number) => {
    if (!project) return { start, end };
    return {
      start: Math.max(0, Math.min(start, project.totalDuration)),
      end: Math.max(0, Math.min(end, project.totalDuration)),
    };
  }, [project]);

  const getMinimumLoopDuration = useCallback((altKey: boolean) => {
    if (!project) return 0;
    return Math.min(project.totalDuration, altKey ? 0.01 : getBeatDuration(project.bpm));
  }, [project]);

  const updateLoopRegionFromPointer = useCallback((clientX: number, altKey: boolean) => {
    const dragState = loopDragRef.current;
    const container = rulerRef.current;
    if (!dragState || !project || !container) return;

    const rawTime = getTimeFromX(clientX, container);
    if (rawTime === undefined) return;

    const minDuration = getMinimumLoopDuration(altKey);
    const originalDuration = dragState.loopEnd - dragState.loopStart;

    if (dragState.mode === 'move') {
      const delta = rawTime - dragState.pointerStartTime;
      const nextStartBase = dragState.loopStart + delta;
      const nextStart = getSnappedTime(nextStartBase, altKey);
      const clampedStart = Math.max(0, Math.min(nextStart, project.totalDuration - originalDuration));
      const clampedEnd = clampedStart + originalDuration;
      setLoopRegion(clampedStart, clampedEnd);
      return;
    }

    if (dragState.mode === 'start') {
      const nextStart = getSnappedTime(rawTime, altKey);
      const boundedStart = Math.max(0, Math.min(nextStart, dragState.loopEnd - minDuration));
      const { start, end } = clampLoopRange(boundedStart, dragState.loopEnd);
      setLoopRegion(start, end);
      return;
    }

    const nextEnd = getSnappedTime(rawTime, altKey);
    const boundedEnd = Math.min(project.totalDuration, Math.max(nextEnd, dragState.loopStart + minDuration));
    const { start, end } = clampLoopRange(dragState.loopStart, boundedEnd);
    setLoopRegion(start, end);
  }, [clampLoopRange, getMinimumLoopDuration, getSnappedTime, getTimeFromX, project, setLoopRegion]);

  const handleLoopPointerDown = useCallback((mode: LoopDragMode) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (!project || !loopEnabled || loopEnd <= loopStart || e.button !== 0) return;
    const container = rulerRef.current;
    if (!container) return;

    const pointerTime = getTimeFromX(e.clientX, container);
    if (pointerTime === undefined) return;

    e.preventDefault();
    e.stopPropagation();

    loopDragRef.current = {
      mode,
      pointerId: e.pointerId,
      pointerStartTime: pointerTime,
      loopStart,
      loopEnd,
    };

    if ('setPointerCapture' in e.currentTarget) {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }, [getTimeFromX, loopEnabled, loopEnd, loopStart, project]);

  const handleLoopPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!loopDragRef.current || loopDragRef.current.pointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    updateLoopRegionFromPointer(e.clientX, e.altKey);
  }, [updateLoopRegionFromPointer]);

  const handleLoopPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!loopDragRef.current || loopDragRef.current.pointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    updateLoopRegionFromPointer(e.clientX, e.altKey);
    loopDragRef.current = null;
    if ('releasePointerCapture' in e.currentTarget && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, [updateLoopRegionFromPointer]);

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
          const beatTime = beatToTime(
            barBeat + (beat - 1) * getTimeSignatureBeatLength(ts.denominator),
            tempoMap,
            bpm,
          );
          if (beatTime > totalDuration) break;
          result.push({ label: `${bar}.${beat}`, x: beatTime * pixelsPerSecond, isBar: false });
        }
      }
    }
    return result;
  }, [project, pixelsPerSecond]);

  if (!project) return <div className="bg-[#1e1e2e] border-b border-[#2a2a3d]" style={{ height: TIMELINE_RULER_HEIGHT }} />;

  const totalWidth = project.totalDuration * pixelsPerSecond;

  return (
    <div
      ref={rulerRef}
      className="relative bg-[#1e1e2e] border-b border-[#2a2a3d] overflow-hidden select-none cursor-pointer"
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
      {/* Cycle/loop region */}
      {loopEnabled && loopEnd > loopStart && (
        <div
          data-testid="timeline-loop-region"
          className="absolute top-0 h-full"
          style={{
            left: loopStart * pixelsPerSecond,
            width: (loopEnd - loopStart) * pixelsPerSecond,
            background: 'linear-gradient(180deg, rgba(234,179,8,0.35) 0%, rgba(234,179,8,0.15) 100%)',
            borderLeft: '1px solid rgba(234,179,8,0.5)',
            borderRight: '1px solid rgba(234,179,8,0.5)',
          }}
        >
          <div
            className="absolute inset-y-0 left-0 w-2 -translate-x-1/2 cursor-col-resize bg-amber-300/50 hover:bg-amber-300/80"
            aria-label="Adjust loop start"
            role="separator"
            data-testid="timeline-loop-start-handle"
            onPointerDown={handleLoopPointerDown('start')}
            onPointerMove={handleLoopPointerMove}
            onPointerUp={handleLoopPointerUp}
            onPointerCancel={handleLoopPointerUp}
          />
          <div
            className="absolute inset-y-[3px] left-1 right-1 rounded-sm border border-amber-300/40 bg-amber-300/10 cursor-grab active:cursor-grabbing"
            aria-label="Move loop region"
            role="button"
            data-testid="timeline-loop-move-handle"
            onPointerDown={handleLoopPointerDown('move')}
            onPointerMove={handleLoopPointerMove}
            onPointerUp={handleLoopPointerUp}
            onPointerCancel={handleLoopPointerUp}
          />
          <div
            className="absolute inset-y-0 right-0 w-2 translate-x-1/2 cursor-col-resize bg-amber-300/50 hover:bg-amber-300/80"
            aria-label="Adjust loop end"
            role="separator"
            data-testid="timeline-loop-end-handle"
            onPointerDown={handleLoopPointerDown('end')}
            onPointerMove={handleLoopPointerMove}
            onPointerUp={handleLoopPointerUp}
            onPointerCancel={handleLoopPointerUp}
          />
        </div>
      )}

      {/* Bar and beat markers */}
      {markers.map(({ label, x, isBar, tsLabel }) => (
        <div
          key={label}
          className="absolute top-0 h-full flex items-end pb-0.5 pointer-events-none"
          style={{ left: x }}
        >
          <div className={`w-px mr-1 ${isBar ? 'h-3 bg-[#5a5a75]' : 'h-2 bg-[#3a3a55]'}`} />
          <span className={`font-medium ${isBar ? 'text-[10px] text-zinc-400/80' : 'text-[9px] text-zinc-500/60'}`}>{label}</span>
          {tsLabel && (
            <span className="text-[8px] text-amber-400/60 ml-0.5">{tsLabel}</span>
          )}
        </div>
      ))}
    </div>
  );
}
