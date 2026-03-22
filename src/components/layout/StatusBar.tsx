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
    <div className="flex items-center h-6 px-3 gap-3 bg-gradient-to-b from-[#2a2a2a] to-[#232323] border-t border-[#1a1a1a] text-[10px] text-zinc-400">
      <div
        className="flex items-center"
        title={connected ? 'Backend connected' : 'Backend offline'}
      >
        <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
      </div>
      {model && <span className="text-zinc-400">{model}</span>}
      {activeJobs.length > 0 && (
        <span className="text-daw-accent truncate">
          Generating: {primaryJob?.trackName ?? 'unknown'}
          {primaryJob?.stage ? ` \u2022 ${primaryJob.stage}` : ''}
          {primaryJob?.progressPercent != null ? ` ${Math.round(primaryJob.progressPercent)}%` : ''}
          {' '}({jobLabel})
        </span>
      )}
      <span className="flex-1" />
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => setShowKeyboardShortcutsDialog(true)}
          className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
            showKeyboardShortcutsDialog
              ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-100'
              : 'border-[#444] text-zinc-400 hover:border-[#555] hover:text-zinc-200'
          }`}
          title="Keyboard shortcuts"
          data-testid="status-shortcuts-trigger"
          aria-label="Keyboard shortcuts"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="1.25" y="2.25" width="11.5" height="8.5" rx="2" />
            <path d="M3.5 5.25h.01M5.75 5.25h.01M8 5.25h.01M10.25 5.25h.01M3.5 7.75h4.5M9.75 7.75h.01" />
          </svg>
        </button>

        <div className="flex items-center gap-1.5 rounded-full border border-[#393939] bg-black/15 px-2 py-0.5" data-testid="status-zoom-controls">
          <button
            type="button"
            onClick={zoomOut}
            className="text-xs text-zinc-400 transition-colors hover:text-zinc-200"
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
            className="w-16 accent-cyan-400"
            aria-label="Timeline zoom"
            data-testid="status-zoom-slider"
          />
          <button
            type="button"
            onClick={zoomIn}
            className="text-xs text-zinc-400 transition-colors hover:text-zinc-200"
            title="Zoom in"
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
