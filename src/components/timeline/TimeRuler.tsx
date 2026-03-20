import { useCallback, useMemo, useRef, memo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useTransportStore } from '../../store/transportStore';
import { useTransport } from '../../hooks/useTransport';
import { getBarDuration, getBeatDuration } from '../../utils/time';
import { beatToTime, getBeatAtBar, getTimeSignatureAtBar } from '../../utils/tempoMap';
import { getScrubPreviewRate } from '../../utils/scrubMath';
import { TIMELINE_RULER_HEIGHT } from './timelineLayout';

export function TimeRuler() {
  const project = useProjectStore((s) => s.project);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const loopEnabled = useTransportStore((s) => s.loopEnabled);
  const loopStart = useTransportStore((s) => s.loopStart);
  const loopEnd = useTransportStore((s) => s.loopEnd);
  const isScrubbing = useTransportStore((s) => s.isScrubbing);
  const currentTime = useTransportStore((s) => s.currentTime);
  const { startScrub, scrubTo, endScrub } = useTransport();
  const scrubStateRef = useRef<{ x: number; time: number; stamp: number } | null>(null);

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

  if (!project) return <div className="bg-[#1e1e2e] border-b border-[#2a2a3d]" style={{ height: TIMELINE_RULER_HEIGHT }} />;

  const totalWidth = project.totalDuration * pixelsPerSecond;

  return (
    <div
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

      {/* Playhead triangle indicator in ruler */}
      <PlayheadRulerIndicator pixelsPerSecond={pixelsPerSecond} />
    </div>
  );
}

/** Playhead position indicator rendered inside the ruler bar */
const PlayheadRulerIndicator = memo(function PlayheadRulerIndicator({ pixelsPerSecond }: { pixelsPerSecond: number }) {
  const currentTime = useTransportStore((s) => s.currentTime);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const timelineFocused = useUIStore((s) => s.timelineFocused);
  const x = currentTime * pixelsPerSecond;
  const blinking = !isPlaying && timelineFocused;

  return (
    <div
      className="absolute bottom-0 z-30 pointer-events-none"
      style={{ left: x, transform: 'translateX(-6px)' }}
    >
      {/* Upright triangle (△) pointing up, positioned at bottom of ruler */}
      <div
        className="w-0 h-0 border-l-[7px] border-r-[7px] border-b-[8px] border-l-transparent border-r-transparent"
        style={{
          borderBottomColor: blinking ? undefined : 'var(--color-daw-playhead)',
          animation: blinking ? 'playhead-blink-triangle-up 1.2s ease-in-out infinite' : 'none',
          filter: 'drop-shadow(0 0 0.5px white)',
        }}
      />
    </div>
  );
});
