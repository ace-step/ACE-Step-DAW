import { useEffect, useState, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useTransportStore } from '../../store/transportStore';
import { useCollaborationStore } from '../../store/collaborationStore';
import { useAudioImport } from '../../hooks/useAudioImport';
import { useTransport } from '../../hooks/useTransport';
import { useRecording } from '../../hooks/useRecording';
import { getMidiCaptureService } from '../../services/midiCaptureService';
import { formatTime, formatBarsBeats } from '../../utils/time';
import { Button } from '../ui/Button';
import { ModelStatusBadge } from './ModelStatusBadge';

function LCDDisplay() {
  const currentTime = useTransportStore((s) => s.currentTime);
  const countInActive = useTransportStore((s) => s.countInActive);
  const countInBeat = useTransportStore((s) => s.countInBeat);
  const sessionArrangementRecording = useTransportStore((s) => s.sessionArrangementRecording);
  const isRecording = useTransportStore((s) => s.isRecording);
  const loopRecordingEnabled = useTransportStore((s) => s.loopRecordingEnabled);
  const loopCycleCount = useTransportStore((s) => s.loopCycleCount);
  const project = useProjectStore((s) => s.project);
  const barsBeats = project
    ? formatBarsBeats(currentTime, project.bpm, project.timeSignature)
    : '1.1.00';

  // During count-in: show negative beat count in cyan (Ableton convention)
  const displayBarsBeats = countInActive ? `${countInBeat}` : barsBeats;
  const barsBeatsColor = countInActive ? 'text-cyan-400 animate-pulse' : 'text-green-400';

  const showLoopCycleBadge = isRecording && loopRecordingEnabled && loopCycleCount > 0;

  return (
    <div className="gb-lcd flex items-center gap-3 px-3 py-1 min-w-[200px] justify-center">
      <span className={`text-[13px] font-mono tabular-nums tracking-wider ${barsBeatsColor}`}>{displayBarsBeats}</span>
      <span className="text-[11px] font-mono tabular-nums text-zinc-400">{formatTime(currentTime)}</span>
      {project && !countInActive && (
        <>
          <span className="text-[11px] font-mono tabular-nums text-zinc-400">{project.bpm} bpm</span>
          <span className="text-[10px] text-emerald-600/60" title="Project auto-saved to browser storage">●</span>
        </>
      )}
      {countInActive && (
        <span className="text-[11px] font-mono text-red-400 animate-pulse">REC</span>
      )}
      {!countInActive && sessionArrangementRecording && (
        <span className="text-[11px] font-mono text-red-400 animate-pulse">SESSION REC</span>
      )}
      {showLoopCycleBadge && (
        <span
          className="text-[10px] font-mono font-semibold text-orange-400 bg-orange-900/30 rounded px-1.5 py-0.5"
          title={`Loop recording pass ${loopCycleCount}`}
          data-testid="loop-cycle-badge"
        >
          Pass {loopCycleCount}
        </span>
      )}
    </div>
  );
}

function ControlBarButton({
  active,
  onClick,
  title,
  disabled,
  dataTarget,
  children,
}: {
  active?: boolean;
  onClick: () => void | Promise<void>;
  title: string;
  disabled?: boolean;
  dataTarget?: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      size="md"
      variant="ghost"
      icon
      active={active}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title.replace(/\s*\(.+?\)$/, '')}
      data-onboarding-target={dataTarget}
    >
      {children}
    </Button>
  );
}

function ToolbarSeparator() {
  return <div className="w-px h-5 bg-[#444]/50" data-testid="toolbar-separator" />;
}

function FileMenu({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const setShowExportDialog = useUIStore((s) => s.setShowExportDialog);
  const showUndoHistoryPanel = useUIStore((s) => s.showUndoHistoryPanel);
  const setShowUndoHistoryPanel = useUIStore((s) => s.setShowUndoHistoryPanel);
  const setShowShareDialog = useCollaborationStore((s) => s.setShowShareDialog);
  const { openFilePicker } = useAudioImport();

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled}
        data-testid="file-menu-trigger"
        className="flex items-center gap-1 px-2 py-1 text-[11px] text-zinc-300 hover:text-white hover:bg-daw-surface-2 rounded transition-colors disabled:opacity-30"
        title="File actions"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
          <path d="M2 3h8M2 6h8M2 9h8" strokeLinecap="round" />
        </svg>
        File
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="opacity-50">
          <path d="M1 2.5L4 5.5L7 2.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-[#2a2a2a] border border-[#444] rounded-lg shadow-xl z-50 py-1" data-testid="file-menu-dropdown">
          <button
            onClick={() => { setShowExportDialog(true); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-300 hover:text-white hover:bg-daw-surface-2 transition-colors"
          >
            Export Audio
          </button>
          <button
            onClick={() => { useProjectStore.getState().exportProjectMidi(); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-300 hover:text-white hover:bg-daw-surface-2 transition-colors"
          >
            Export MIDI
          </button>
          <button
            onClick={() => { openFilePicker(); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-300 hover:text-white hover:bg-daw-surface-2 transition-colors"
          >
            Import Audio/MIDI
          </button>
          <div className="w-full h-px bg-[#444]/50 my-1" />
          <button
            onClick={() => { setShowUndoHistoryPanel(!showUndoHistoryPanel); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-300 hover:text-white hover:bg-daw-surface-2 transition-colors"
          >
            Undo History
          </button>
          <button
            onClick={() => { setShowShareDialog(true); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-300 hover:text-white hover:bg-daw-surface-2 transition-colors"
          >
            Share Project
          </button>
        </div>
      )}
    </div>
  );
}

export function Toolbar() {
  const project = useProjectStore((s) => s.project);
  const modelName = useProjectStore((s) => s.project?.generationDefaults.model ?? '');
  const setShowNewProjectDialog = useUIStore((s) => s.setShowNewProjectDialog);
  const setShowSettingsDialog = useUIStore((s) => s.setShowSettingsDialog);
  const setShowProjectListDialog = useUIStore((s) => s.setShowProjectListDialog);
  const setShowKeyboardShortcutsDialog = useUIStore((s) => s.setShowKeyboardShortcutsDialog);
  const openCommandPalette = useUIStore((s) => s.openCommandPalette);
  const mainView = useUIStore((s) => s.mainView);
  const setMainView = useUIStore((s) => s.setMainView);
  const setBatchGenerateMode = useUIStore((s) => s.setBatchGenerateMode);
  const showMixer = useUIStore((s) => s.showMixer);
  const setShowMixer = useUIStore((s) => s.setShowMixer);
  const loopBrowserOpen = useUIStore((s) => s.loopBrowserOpen);
  const toggleLoopBrowser = useUIStore((s) => s.toggleLoopBrowser);
  const showLibrary = useUIStore((s) => s.showLibrary);
  const setShowLibrary = useUIStore((s) => s.setShowLibrary);
  const showSmartControls = useUIStore((s) => s.showSmartControls);
  const setShowSmartControls = useUIStore((s) => s.setShowSmartControls);
  const showAIAssistant = useUIStore((s) => s.showAIAssistant);
  const toggleAIAssistant = useUIStore((s) => s.toggleAIAssistant);
  const showGenerationPanel = useUIStore((s) => s.showGenerationPanel);
  const toggleGenerationPanel = useUIStore((s) => s.toggleGenerationPanel);
  const isViewerMode = useCollaborationStore((s) => s.isViewerMode);
  const { toggleRecord } = useRecording();

  const { isPlaying, play, pause, stop } = useTransport();
  const loopEnabled = useTransportStore((s) => s.loopEnabled);
  const isRecording = useTransportStore((s) => s.isRecording);
  const toggleLoop = useTransportStore((s) => s.toggleLoop);
  const loopRecordingEnabled = useTransportStore((s) => s.loopRecordingEnabled);
  const toggleLoopRecording = useTransportStore((s) => s.toggleLoopRecording);
  const metronomeEnabled = useTransportStore((s) => s.metronomeEnabled);
  const toggleMetronome = useTransportStore((s) => s.toggleMetronome);
  const zoomIn = useUIStore((s) => s.zoomIn);
  const zoomOut = useUIStore((s) => s.zoomOut);
  const autoScrollEnabled = useUIStore((s) => s.autoScrollEnabled);
  const toggleAutoScroll = useUIStore((s) => s.toggleAutoScroll);

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__commandPaletteRuntime = {
      play,
      pause,
      stop,
    };

    return () => {
      delete (window as unknown as Record<string, unknown>).__commandPaletteRuntime;
    };
  }, [pause, play, stop]);

  return (
    <div className="flex items-center h-11 px-2 gap-1 bg-gradient-to-b from-[#3a3a3a] to-[#2d2d2d] border-b border-[#1a1a1a] shrink-0 select-none">
      {/* Left: Panel toggle buttons */}
      <div className="flex items-center gap-0.5 bg-[#2a2a2a]/60 rounded-lg px-1.5 py-0.5" data-testid="toolbar-group">
        <ControlBarButton
          active={showLibrary}
          onClick={() => setShowLibrary(!showLibrary)}
          title="Library (Y)"
          disabled={!project}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
            <rect x="1" y="2" width="12" height="10" rx="1.5" />
            <line x1="5" y1="2" x2="5" y2="12" />
          </svg>
        </ControlBarButton>
        <ControlBarButton
          active={showSmartControls}
          onClick={() => setShowSmartControls(!showSmartControls)}
          title="Smart Controls (B)"
          disabled={!project}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
            <circle cx="4" cy="7" r="2.5" />
            <circle cx="10" cy="7" r="2.5" />
            <line x1="4" y1="4.5" x2="4" y2="2" />
            <line x1="10" y1="4.5" x2="10" y2="2" />
          </svg>
        </ControlBarButton>
      </div>

      <ToolbarSeparator />

      <div className="flex items-center gap-0.5 rounded-lg border border-[#4b4b4b] bg-[#242424] p-0.5">
        <Button
          variant="ghost"
          size="sm"
          active={mainView === 'arrangement'}
          onClick={() => setMainView('arrangement')}
          title="Arrangement View (Tab)"
          aria-label="Switch to Arrangement View"
        >
          Arrangement
        </Button>
        <Button
          variant="ghost"
          size="sm"
          active={mainView === 'session'}
          onClick={() => setMainView('session')}
          title="Session View (Tab)"
          aria-label="Switch to Session View"
        >
          Session
        </Button>
      </div>

      <ToolbarSeparator />

      {/* Generation actions */}
      <div className="flex items-center gap-0.5 bg-[#2a2a2a]/60 rounded-lg px-1.5 py-0.5" data-testid="toolbar-group">
        <button
          onClick={() => setBatchGenerateMode('silence')}
          disabled={!project}
          data-onboarding-target="genr-button"
          aria-label="Open genr"
          className="rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold tracking-[0.18em] text-cyan-200 uppercase transition-colors hover:bg-cyan-400/20 disabled:opacity-30"
          title="genr (Cmd+G)"
        >
          genr
        </button>
        <button
          onClick={toggleGenerationPanel}
          disabled={!project}
          aria-pressed={showGenerationPanel}
          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${
            showGenerationPanel
              ? 'border border-indigo-400/50 bg-indigo-500/20 text-indigo-100'
              : 'border border-[#4b4b4b] bg-[#242424] text-zinc-300 hover:bg-daw-surface-2'
          } disabled:opacity-30`}
          title="AI Generation Panel (G)"
        >
          AI
        </button>
      </div>

      <ToolbarSeparator />

      {/* Project actions + File menu */}
      <div className="flex items-center gap-0.5 bg-[#2a2a2a]/60 rounded-lg px-1.5 py-0.5" data-testid="toolbar-group">
        <Button variant="ghost" size="sm" onClick={() => setShowProjectListDialog(true)} title="Projects">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" className="inline -mt-px mr-1">
            <path d="M1.5 4.5L7 1.5l5.5 3M1.5 7l5.5 3 5.5-3M1.5 9.5l5.5 3 5.5-3" />
          </svg>
          Projects
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowNewProjectDialog(true)} title="New Project">
          New
        </Button>
        <FileMenu disabled={!project} />
        <ModelStatusBadge modelName={modelName} onClick={() => setShowLibrary(true)} />
      </div>

      <div className="flex-1" />

      {/* Center: Transport controls — prominent pill container */}
      <div
        className="flex items-center gap-0.5 bg-[#353535] rounded-full px-2 py-0.5"
        data-testid="transport-bar"
        data-onboarding-target="transport"
      >
        {/* Rewind */}
        <ControlBarButton onClick={() => void stop()} title="Go to Beginning (Enter)">
          <svg width="14" height="12" viewBox="0 0 14 12" fill="currentColor">
            <rect x="0" y="1" width="2" height="10" rx="0.5" />
            <path d="M13 1L5 6l8 5V1z" />
          </svg>
        </ControlBarButton>
        {/* Play/Pause — larger for prominence */}
        <button
          onClick={() => void (isPlaying ? pause() : play())}
          className={`w-10 h-9 flex items-center justify-center rounded-lg transition-[color,background-color,transform] duration-150 active:scale-95 ${
            isPlaying
              ? 'bg-daw-accent text-white shadow-md'
              : 'text-zinc-300 hover:text-white hover:bg-daw-surface-2'
          }`}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {isPlaying ? (
            <svg width="14" height="16" viewBox="0 0 12 14" fill="currentColor">
              <rect width="4" height="14" rx="1" />
              <rect x="8" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="14" height="16" viewBox="0 0 12 14" fill="currentColor">
              <path d="M0 0L12 7L0 14V0Z" />
            </svg>
          )}
        </button>
        <ControlBarButton onClick={() => void toggleRecord()} title="Record (R)" active={isRecording}>
          <div className={`w-3.5 h-3.5 rounded-full bg-red-500 ${isRecording ? 'animate-pulse' : 'opacity-60'}`} />
        </ControlBarButton>
        <ControlBarButton
          onClick={() => {
            const armedTrackIds = useTransportStore.getState().armedTrackIds;
            const targetTrackId = armedTrackIds[0];
            if (targetTrackId) {
              const captureService = getMidiCaptureService();
              const currentTime = useTransportStore.getState().currentTime;
              useProjectStore.getState().captureMidi(targetTrackId, currentTime, captureService);
            }
          }}
          title="Capture MIDI (F)"
          disabled={!project}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="7" cy="7" r="5" />
            <polyline points="5,6 7,9 9,5" />
          </svg>
        </ControlBarButton>
      </div>

      <ToolbarSeparator />

      {/* LCD Display */}
      <LCDDisplay />

      <ToolbarSeparator />

      {/* Cycle + Metronome */}
      <div className="flex items-center gap-0.5 bg-[#2a2a2a]/60 rounded-lg px-1.5 py-0.5" data-testid="toolbar-group">
        <ControlBarButton active={loopEnabled} onClick={toggleLoop} title="Cycle (C)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 1l2 2-2 2" />
            <path d="M4 13l-2-2 2-2" />
            <path d="M12 3H5a3 3 0 0 0 0 6" />
            <path d="M2 11h7a3 3 0 0 0 0-6" />
          </svg>
        </ControlBarButton>
        <ControlBarButton active={loopRecordingEnabled} onClick={toggleLoopRecording} title="Overdub / Loop Recording (Shift+L)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 1l2 2-2 2" />
            <path d="M4 13l-2-2 2-2" />
            <path d="M12 3H5a3 3 0 0 0 0 6" />
            <path d="M2 11h7a3 3 0 0 0 0-6" />
            <circle cx="7" cy="7" r="2" fill="currentColor" stroke="none" />
          </svg>
        </ControlBarButton>
        <ControlBarButton active={metronomeEnabled} onClick={toggleMetronome} title="Metronome (K)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 13L7 1l3 12" />
            <path d="M3 13h8" />
            <path d="M7 5l4-2" />
          </svg>
        </ControlBarButton>
        <ControlBarButton
          active={autoScrollEnabled}
          onClick={toggleAutoScroll}
          title="Auto-Scroll / Follow Playhead (Shift+F)"
          disabled={!project}
          dataTarget="auto-scroll-button"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 1v12" />
            <path d="M7 1l-2.5 3" />
            <path d="M7 1l2.5 3" />
            <path d="M1 5h4" />
            <path d="M9 5h4" />
          </svg>
        </ControlBarButton>
      </div>

      <div className="flex-1" />

      {/* Right: Panel toggles */}
      <div className="flex items-center gap-0.5 bg-[#2a2a2a]/60 rounded-lg px-1.5 py-0.5" data-testid="toolbar-group">
        <ControlBarButton
          active={showMixer}
          onClick={() => setShowMixer(!showMixer)}
          title="Mixer (X)"
          disabled={!project}
          dataTarget="mixer-button"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
            <line x1="3" y1="2" x2="3" y2="12" />
            <line x1="7" y1="2" x2="7" y2="12" />
            <line x1="11" y1="2" x2="11" y2="12" />
            <circle cx="3" cy="8" r="1.5" fill="currentColor" />
            <circle cx="7" cy="5" r="1.5" fill="currentColor" />
            <circle cx="11" cy="9" r="1.5" fill="currentColor" />
          </svg>
        </ControlBarButton>
        <ControlBarButton
          active={loopBrowserOpen}
          onClick={toggleLoopBrowser}
          title="Loop Browser (O)"
          disabled={!project}
          dataTarget="loop-browser-button"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
            <circle cx="6" cy="6" r="4" />
            <path d="M9 9l3.5 3.5" strokeLinecap="round" />
          </svg>
        </ControlBarButton>
        <ControlBarButton
          active={showAIAssistant}
          onClick={toggleAIAssistant}
          title="AI Assistant (Cmd+/)"
          dataTarget="assistant-button"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
            <circle cx="7" cy="7" r="5.5" />
            <path d="M5 6.5h4M5 8.5h2.5" strokeLinecap="round" />
            <circle cx="7" cy="4.5" r="0.8" fill="currentColor" />
          </svg>
        </ControlBarButton>
      </div>

      <ToolbarSeparator />

      {/* Settings + Shortcuts */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => openCommandPalette()}
          className="flex items-center gap-2 rounded px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:bg-daw-surface-2 hover:text-white"
          title="Command Palette (Cmd/Ctrl+K)"
          aria-label="Open command palette"
          data-onboarding-target="command-palette-button"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
            <circle cx="6" cy="6" r="3.75" />
            <path d="M8.8 8.8L12 12" strokeLinecap="round" />
          </svg>
          <span>Command</span>
          <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400">
            Cmd+K
          </span>
        </button>
        <Button
          variant="ghost"
          size="md"
          icon
          onClick={() => setShowSettingsDialog(true)}
          title="Settings"
          aria-label="Settings"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
            <circle cx="7" cy="7" r="2" />
            <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.8 2.8l1 1M10.2 10.2l1 1M11.2 2.8l-1 1M3.8 10.2l-1 1" />
          </svg>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon
          onClick={() => setShowKeyboardShortcutsDialog(true)}
          title="Keyboard Shortcuts (?)"
        >
          ?
        </Button>
      </div>

      {/* Viewer mode badge */}
      {isViewerMode && (
        <div className="px-2 py-0.5 text-[10px] font-medium text-amber-400 bg-amber-950/40 rounded border border-amber-800/40" title="Read-only viewer mode">
          VIEWER
        </div>
      )}

      {/* Zoom controls */}
      <ToolbarSeparator />
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="sm" icon onClick={zoomOut} title="Zoom Out">
          −
        </Button>
        <Button variant="ghost" size="sm" icon onClick={zoomIn} title="Zoom In">
          +
        </Button>
      </div>
    </div>
  );
}
