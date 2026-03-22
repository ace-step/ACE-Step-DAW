import { useState, useEffect } from 'react';
import { healthCheck } from '../../services/aceStepApi';
import { useGenerationStore } from '../../store/generationStore';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { TIMELINE_ZOOM_LEVELS } from '../../utils/timelineZoom';

const HEALTH_POLL_INTERVAL_MS = 10_000;

let lastKnownBackendConnection = false;

/** @internal Reset module state for tests */
export function _resetLastKnownConnection() {
  lastKnownBackendConnection = false;
}

export function StatusBar() {
  const [connected, setConnected] = useState(lastKnownBackendConnection);
  const jobs = useGenerationStore((s) => s.jobs);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const setPixelsPerSecond = useUIStore((s) => s.setPixelsPerSecond);
  const zoomIn = useUIStore((s) => s.zoomIn);
  const zoomOut = useUIStore((s) => s.zoomOut);
  const showKeyboardShortcutsDialog = useUIStore((s) => s.showKeyboardShortcutsDialog);
  const setShowKeyboardShortcutsDialog = useUIStore((s) => s.setShowKeyboardShortcutsDialog);
  const activeJobs = [...jobs]
    .filter((j) => j.status === 'generating' || j.status === 'queued' || j.status === 'processing')
    .sort((a, b) => (a.lastUpdatedAt ?? 0) - (b.lastUpdatedAt ?? 0));
  const primaryJob = activeJobs[activeJobs.length - 1] ?? null;
  const model = useProjectStore((s) => s.project?.generationDefaults.model);

  useEffect(() => {
    let active = true;
    let interval: number | null = null;
    const check = async () => {
      const ok = await healthCheck();
      lastKnownBackendConnection = ok;
      if (active) setConnected(ok);
    };

    const timeout = window.setTimeout(() => {
      void check();
      interval = window.setInterval(check, HEALTH_POLL_INTERVAL_MS);
    }, HEALTH_POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      if (interval !== null) {
        window.clearInterval(interval);
      }
    };
  }, []);

  const jobCount = activeJobs.length;
  const jobLabel = jobCount === 1 ? '1 job' : `${jobCount} jobs`;
  const zoomIndex = TIMELINE_ZOOM_LEVELS.reduce((nearestIndex, level, index) => {
    const nearestDistance = Math.abs(TIMELINE_ZOOM_LEVELS[nearestIndex] - pixelsPerSecond);
    const currentDistance = Math.abs(level - pixelsPerSecond);
    return currentDistance < nearestDistance ? index : nearestIndex;
  }, 0);

  return (
    <>
      <div className="border-t border-[#1a1a1a] bg-gradient-to-b from-[#2a2a2a] to-[#232323] text-[10px] text-zinc-400">
        <div className="flex h-6 items-center gap-3 px-3">
          <div
            className="flex items-center"
            title={connected ? 'Backend connected' : 'Backend offline'}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
          </div>
          {activeJobs.length > 0 && (
            <span className="text-daw-accent truncate">
              Generating: {primaryJob?.trackName ?? 'unknown'}
              {primaryJob?.stage ? ` \u2022 ${primaryJob.stage}` : ''}
              {primaryJob?.progressPercent != null ? ` ${Math.round(primaryJob.progressPercent)}%` : ''}
              {' '}({jobLabel})
            </span>
          )}
          <span className="flex-1" />
        </div>

        <div className="flex h-6 items-center gap-3 border-t border-white/4 px-3">
          {model && <span className="truncate text-zinc-400">{model}</span>}
          <span className="flex-1" />
          <div className="flex items-center gap-1.5 text-zinc-500">
            <button
              type="button"
              onClick={() => setShowKeyboardShortcutsDialog(true)}
              className={`flex h-[18px] w-[18px] items-center justify-center rounded border transition-colors ${
                showKeyboardShortcutsDialog
                  ? 'border-white/12 bg-white/[0.06] text-zinc-100'
                  : 'border-transparent bg-transparent text-zinc-500 hover:border-white/8 hover:bg-white/[0.04] hover:text-zinc-200'
              }`}
              title="Keyboard shortcuts"
              data-testid="status-shortcuts-trigger"
              aria-label="Keyboard shortcuts"
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="1.25" y="2.25" width="11.5" height="8.5" rx="2" />
                <path d="M3.5 5.25h.01M5.75 5.25h.01M8 5.25h.01M10.25 5.25h.01M3.5 7.75h4.5M9.75 7.75h.01" />
              </svg>
            </button>

            <div className="flex items-center gap-1 rounded-md border border-white/6 bg-black/10 px-1.5 py-0.5" data-testid="status-zoom-controls">
              <button
                type="button"
                onClick={zoomOut}
                className="flex h-4 w-4 items-center justify-center rounded text-[11px] text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
                title="Zoom out"
                aria-label="Zoom out"
              >
                −
              </button>
              <input
                type="range"
                min={0}
                max={TIMELINE_ZOOM_LEVELS.length - 1}
                step={1}
                value={zoomIndex}
                onChange={(event) => {
                  const level = TIMELINE_ZOOM_LEVELS[Number(event.target.value)];
                  if (level) {
                    setPixelsPerSecond(level);
                  }
                }}
                className="w-[88px] accent-zinc-500 opacity-70 transition-opacity hover:opacity-100"
                aria-label="Timeline zoom"
                data-testid="status-zoom-slider"
              />
              <button
                type="button"
                onClick={zoomIn}
                className="flex h-4 w-4 items-center justify-center rounded text-[11px] text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
                title="Zoom in"
                aria-label="Zoom in"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
