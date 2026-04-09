import { useState, useEffect } from 'react';
import { healthCheck } from '../../services/aceStepApi';
import { useGenerationStore } from '../../store/generationStore';
import { useModelStore } from '../../store/modelStore';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { TIMELINE_ZOOM_LEVELS } from '../../utils/timelineZoom';
import { SaveStatusIndicator } from './SaveStatusIndicator';
import type { SaveStatus } from '../../hooks/useAutoSave';
import { OnboardingProgress } from './OnboardingProgress';

const HEALTH_POLL_INTERVAL_MS = 10_000;
const DEFAULT_SOURCE_CODE_URL = 'https://github.com/ace-step/ACE-Step-DAW';
const CURRENT_YEAR = new Date().getFullYear();
const DEFAULT_COPYRIGHT_NOTICE = `ACE Studio © ${CURRENT_YEAR}`;

let lastKnownBackendConnection = false;

/** @internal Reset module state for tests */
export function _resetLastKnownConnection() {
  lastKnownBackendConnection = false;
}

interface StatusBarProps {
  saveStatus?: SaveStatus;
  lastSavedAt?: number | null;
}

export function StatusBar({ saveStatus, lastSavedAt }: StatusBarProps) {
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
  const activeModelId = useModelStore((s) => s.activeModelId);
  const activeLmModelId = useModelStore((s) => s.activeLmModelId);
  const categoryOverrides = useModelStore((s) => s.categoryModelOverrides);
  const availableModels = useModelStore((s) => s.availableModels);
  const availableLmModels = useModelStore((s) => s.availableLmModels);

  useEffect(() => {
    let active = true;
    let interval: number | null = null;
    const check = async () => {
      const ok = await healthCheck();
      const wasDisconnected = !lastKnownBackendConnection;
      lastKnownBackendConnection = ok;
      if (active) setConnected(ok);
      // On first successful connection (or reconnect), sync model state from server
      if (ok && wasDisconnected) {
        void useModelStore.getState().refreshModels();
      }
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
  // Per-model loaded status
  const t2mName = categoryOverrides.text2music || activeModelId || null;
  const legoName = categoryOverrides.lego || null;
  const lmName = activeLmModelId || null;
  const isT2mLoaded = t2mName ? availableModels.some((m) => m.name === t2mName && m.is_loaded) : false;
  const isLegoLoaded = legoName ? availableModels.some((m) => m.name === legoName && m.is_loaded) : false;
  const isLmLoaded = lmName ? availableLmModels.some((m) => m.name === lmName && m.is_loaded) : false;
  const sourceCodeUrl = import.meta.env.VITE_SOURCE_CODE_URL?.trim() || DEFAULT_SOURCE_CODE_URL;
  const normalizedSourceCodeUrl = sourceCodeUrl.replace(/\/$/, '');
  const licenseUrl = import.meta.env.VITE_LICENSE_URL?.trim() || `${normalizedSourceCodeUrl}/blob/main/LICENSE`;
  const copyrightNotice = import.meta.env.VITE_COPYRIGHT_NOTICE?.trim() || DEFAULT_COPYRIGHT_NOTICE;
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
            <span className="text-daw-accent truncate tabular-nums">
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
          <span
            className="inline-flex items-center gap-1 text-daw-text-muted"
            data-testid="status-connection"
            title={connected ? 'Backend server connected' : 'Backend server disconnected'}
          >
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${connected ? 'bg-emerald-500' : 'bg-zinc-500'}`}
              data-testid="connection-dot"
            />
            <span>{connected ? 'Online' : 'Offline'}</span>
          </span>
          <span className="hidden lg:inline-flex items-center gap-3 truncate text-daw-text-muted" data-testid="status-model-name">
            {t2mName ? (
              <span className="inline-flex items-center gap-1">
                <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${isT2mLoaded ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                <span>Mixture: {t2mName}</span>
              </span>
            ) : null}
            {legoName ? (
              <span className="inline-flex items-center gap-1">
                <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${isLegoLoaded ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                <span>Stems: {legoName}</span>
              </span>
            ) : null}
            {lmName ? (
              <span className="inline-flex items-center gap-1">
                <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${isLmLoaded ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                <span>LM: {lmName}</span>
              </span>
            ) : null}
            {!t2mName && !legoName && !lmName && <span>No model</span>}
          </span>
          <span className="flex-1" />
          <div className="hidden items-center gap-1.5 text-[9px] text-daw-text-muted/80 md:flex" data-testid="status-legal-notice">
            <span className="whitespace-nowrap text-daw-text-muted/90" data-testid="status-copyright-notice">{copyrightNotice}</span>
            <span
              className="inline-flex items-center rounded-full border border-white/8 px-1.5 py-[1px] text-[8px] uppercase tracking-[0.16em] text-daw-text-muted/75"
              data-testid="status-no-warranty"
              title="No warranty. Share and modify under AGPL-3.0-or-later."
            >
              No warranty
            </span>
            <a
              href={sourceCodeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-white/8 px-2 py-0.5 text-daw-accent transition-colors hover:border-white/14 hover:bg-daw-hover-subtle hover:text-white"
              data-testid="status-source-link"
              aria-label="View corresponding source code"
              title="View corresponding source code"
            >
              Source
            </a>
            <a
              href={licenseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-white/8 px-2 py-0.5 text-daw-accent transition-colors hover:border-white/14 hover:bg-daw-hover-subtle hover:text-white"
              data-testid="status-license-link"
              aria-label="View AGPL license"
              title="View AGPL-3.0-or-later license"
            >
              AGPL
            </a>
          </div>
          {saveStatus && (
            <SaveStatusIndicator status={saveStatus} lastSavedAt={lastSavedAt} />
          )}
          <OnboardingProgress />
          <div className="hidden md:flex items-center gap-1.5 text-daw-text-muted">
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
