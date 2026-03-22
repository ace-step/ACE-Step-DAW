import { useState, useEffect } from 'react';
import { healthCheck } from '../../services/aceStepApi';
import { useGenerationStore } from '../../store/generationStore';
import { useModelStore } from '../../store/modelStore';
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
  const showMixer = useUIStore((s) => s.showMixer);
  const setShowMixer = useUIStore((s) => s.setShowMixer);
  const showAIAssistant = useUIStore((s) => s.showAIAssistant);
  const toggleAIAssistant = useUIStore((s) => s.toggleAIAssistant);
  const project = useProjectStore((s) => s.project);
  const activeJobs = [...jobs]
    .filter((j) => j.status === 'generating' || j.status === 'queued' || j.status === 'processing')
    .sort((a, b) => (a.lastUpdatedAt ?? 0) - (b.lastUpdatedAt ?? 0));
  const primaryJob = activeJobs[activeJobs.length - 1] ?? null;
  const projectModel = useProjectStore((s) => s.project?.generationDefaults.model ?? '');
  const activeModelId = useModelStore((s) => s.activeModelId);

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
  const hasActiveJobs = activeJobs.length > 0;
  const resolvedModelName = projectModel.trim() || activeModelId?.trim() || 'No model';
  const zoomIndex = TIMELINE_ZOOM_LEVELS.reduce((nearestIndex, level, index) => {
    const nearestDistance = Math.abs(TIMELINE_ZOOM_LEVELS[nearestIndex] - pixelsPerSecond);
    const currentDistance = Math.abs(level - pixelsPerSecond);
    return currentDistance < nearestDistance ? index : nearestIndex;
  }, 0);

  return (
    <>
      <div className="border-t border-daw-border-strong bg-daw-surface-2 text-[10px] text-daw-text-muted" data-testid="status-bar">
        {hasActiveJobs && (
          <div className="flex h-6 items-center gap-3 px-3" data-testid="status-bar-job-row">
            <span className="text-daw-accent truncate">
              Generating: {primaryJob?.trackName ?? 'unknown'}
              {primaryJob?.stage ? ` \u2022 ${primaryJob.stage}` : ''}
              {primaryJob?.progressPercent != null ? ` ${Math.round(primaryJob.progressPercent)}%` : ''}
              {' '}({jobLabel})
            </span>
            <span className="flex-1" />
          </div>
        )}

        <div
          className={`flex h-6 items-center gap-3 px-3 ${hasActiveJobs ? 'border-t border-white/4' : ''}`}
          data-testid="status-bar-meta-row"
        >
          <div
            className="flex items-center"
            title={connected ? 'Backend connected' : 'Backend offline'}
            data-testid="status-connection-indicator"
          >
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
          </div>
          <span className="truncate text-daw-text-muted" data-testid="status-model-name">{resolvedModelName}</span>
          <span className="flex-1" />
          <div className="flex items-center gap-1.5 text-daw-text-muted">
            <button
              type="button"
              onClick={() => setShowMixer(!showMixer)}
              disabled={!project}
              className={`flex h-[18px] w-[18px] items-center justify-center rounded border transition-colors ${
                showMixer
                  ? 'border-white/12 bg-white/[0.06] text-zinc-100'
                  : 'border-transparent bg-transparent text-daw-text-muted hover:border-white/8 hover:bg-daw-hover-subtle hover:text-zinc-200'
              } disabled:opacity-30`}
              title="Mixer (X)"
              data-testid="status-mixer-toggle"
              data-onboarding-target="mixer-button"
              aria-label="Mixer"
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                <line x1="3" y1="2" x2="3" y2="12" />
                <line x1="7" y1="2" x2="7" y2="12" />
                <line x1="11" y1="2" x2="11" y2="12" />
                <circle cx="3" cy="8" r="1.5" fill="currentColor" />
                <circle cx="7" cy="5" r="1.5" fill="currentColor" />
                <circle cx="11" cy="9" r="1.5" fill="currentColor" />
              </svg>
            </button>
            <button
              type="button"
              onClick={toggleAIAssistant}
              className={`flex h-[18px] w-[18px] items-center justify-center rounded border transition-colors ${
                showAIAssistant
                  ? 'border-white/12 bg-white/[0.06] text-zinc-100'
                  : 'border-transparent bg-transparent text-daw-text-muted hover:border-white/8 hover:bg-daw-hover-subtle hover:text-zinc-200'
              }`}
              title="AI Assistant (Cmd+/)"
              data-testid="status-ai-assistant-toggle"
              data-onboarding-target="assistant-button"
              aria-label="AI Assistant"
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
                <path d="M7 1v3M7 10v3M1 7h3M10 7h3" />
                <path d="M3.5 3.5l2 2M8.5 8.5l2 2M8.5 3.5l2 2M3.5 8.5l-2 2" />
              </svg>
            </button>

            <div className="w-px h-3.5 bg-white/8" />

            <button
              type="button"
              onClick={() => setShowKeyboardShortcutsDialog(true)}
              className={`flex h-[18px] w-[18px] items-center justify-center rounded border transition-colors ${
                showKeyboardShortcutsDialog
                  ? 'border-white/12 bg-white/[0.06] text-zinc-100'
                  : 'border-transparent bg-transparent text-daw-text-muted hover:border-white/8 hover:bg-daw-hover-subtle hover:text-zinc-200'
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

            <div className="flex items-center gap-1 rounded-md border border-white/6 bg-transparent px-1.5 py-0.5" data-testid="status-zoom-controls">
              <button
                type="button"
                onClick={zoomOut}
                className="flex h-4 w-4 items-center justify-center rounded text-[11px] text-daw-text-muted transition-colors hover:bg-daw-hover-subtle hover:text-zinc-200"
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
                className="w-[88px] accent-zinc-400 opacity-70 transition-opacity hover:opacity-100"
                aria-label="Timeline zoom"
                data-testid="status-zoom-slider"
              />
              <button
                type="button"
                onClick={zoomIn}
                className="flex h-4 w-4 items-center justify-center rounded text-[11px] text-daw-text-muted transition-colors hover:bg-daw-hover-subtle hover:text-zinc-200"
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
