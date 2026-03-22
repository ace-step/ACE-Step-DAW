import { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useTransportStore } from '../../store/transportStore';
import { useCollaborationStore } from '../../store/collaborationStore';
import { useAudioImport } from '../../hooks/useAudioImport';
import { useTransport } from '../../hooks/useTransport';
import { useRecording } from '../../hooks/useRecording';
import { getMidiCaptureService } from '../../services/midiCaptureService';
import { DEFAULT_MEASURES } from '../../constants/defaults';
import { KEY_SCALES } from '../../constants/tracks';
import { formatTime, formatBarsBeats } from '../../utils/time';
import { Button } from '../ui/Button';

const KEY_ROOT_LABELS: Record<string, string> = {
  C: 'C',
  'C#': 'C#/Db',
  D: 'D',
  'D#': 'D#/Eb',
  E: 'E',
  F: 'F',
  'F#': 'F#/Gb',
  G: 'G',
  'G#': 'G#/Ab',
  A: 'A',
  'A#': 'A#/Bb',
  B: 'B',
};

const KEY_ROOTS = Array.from(
  new Set(KEY_SCALES.map((keyScale) => keyScale.slice(0, keyScale.lastIndexOf(' ')))),
);

const SCALE_MODES = Array.from(
  new Set(KEY_SCALES.map((keyScale) => keyScale.slice(keyScale.lastIndexOf(' ') + 1))),
);

const SCALE_MODE_LABELS: Record<string, string> = {
  major: 'Maj',
  minor: 'Min',
};

function splitKeyScale(keyScale?: string) {
  if (!keyScale) {
    return { root: 'C', mode: 'major' };
  }
  const splitIndex = keyScale.lastIndexOf(' ');
  if (splitIndex === -1) {
    return { root: 'C', mode: 'major' };
  }
  const root = keyScale.slice(0, splitIndex);
  const mode = keyScale.slice(splitIndex + 1).toLowerCase();
  return {
    root: KEY_ROOTS.includes(root) ? root : 'C',
    mode: SCALE_MODES.includes(mode) ? mode : 'major',
  };
}

const inputClass = 'h-6 rounded bg-transparent px-1.5 text-center text-[11px] font-mono text-zinc-300 hover:bg-daw-hover-subtle focus:bg-daw-hover-subtle focus:text-white focus:outline-none disabled:opacity-50';
const selectClass = 'h-6 rounded bg-transparent px-1.5 text-[11px] text-zinc-300 hover:bg-daw-hover-subtle focus:bg-daw-hover-subtle focus:text-white focus:outline-none disabled:opacity-50';

const VALID_DENOMINATORS = [2, 4, 8, 16];

function ProjectSettingsStrip({ disabled }: { disabled: boolean }) {
  const project = useProjectStore((s) => s.project);
  const updateProject = useProjectStore((s) => s.updateProject);
  const [bpmInput, setBpmInput] = useState('120');
  const [measuresInput, setMeasuresInput] = useState(String(DEFAULT_MEASURES));
  const [tsNumeratorInput, setTsNumeratorInput] = useState('4');
  const [tsDenominatorInput, setTsDenominatorInput] = useState('4');

  useEffect(() => {
    if (!project) return;
    setBpmInput(String(project.bpm));
    setMeasuresInput(String(project.measures ?? DEFAULT_MEASURES));
    setTsNumeratorInput(String(project.timeSignature ?? 4));
    setTsDenominatorInput(String(project.timeSignatureDenominator ?? 4));
  }, [project?.bpm, project?.measures, project?.timeSignature, project?.timeSignatureDenominator, project]);

  const keyScale = splitKeyScale(project?.keyScale);

  const commitBpm = () => {
    const parsed = Number.parseInt(bpmInput, 10);
    const nextBpm = Number.isNaN(parsed) ? (project?.bpm ?? 120) : Math.min(300, Math.max(40, parsed));
    setBpmInput(String(nextBpm));
    if (project && nextBpm !== project.bpm) {
      updateProject({ bpm: nextBpm });
    }
  };

  const commitMeasures = () => {
    const parsed = Number.parseInt(measuresInput, 10);
    const nextMeasures = Number.isNaN(parsed)
      ? (project?.measures ?? DEFAULT_MEASURES)
      : Math.min(512, Math.max(4, parsed));
    setMeasuresInput(String(nextMeasures));
    if (project && nextMeasures !== project.measures) {
      updateProject({ measures: nextMeasures });
    }
  };

  const commitTimeSignatureNumerator = () => {
    const parsed = Number.parseInt(tsNumeratorInput, 10);
    const nextTs = Number.isNaN(parsed)
      ? (project?.timeSignature ?? 4)
      : Math.min(12, Math.max(1, parsed));
    setTsNumeratorInput(String(nextTs));
    if (project && nextTs !== project.timeSignature) {
      updateProject({ timeSignature: nextTs });
    }
  };

  const commitTimeSignatureDenominator = () => {
    const parsed = Number.parseInt(tsDenominatorInput, 10);
    const nextDenom = Number.isNaN(parsed) || !VALID_DENOMINATORS.includes(parsed)
      ? (project?.timeSignatureDenominator ?? 4)
      : parsed;
    setTsDenominatorInput(String(nextDenom));
    if (project && nextDenom !== (project.timeSignatureDenominator ?? 4)) {
      updateProject({ timeSignatureDenominator: nextDenom } as never);
    }
  };

  const blurOnEnter = (event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
  };

  const updateKeyScale = (nextRoot: string, nextMode: string) => {
    if (!project) return;
    updateProject({ keyScale: `${nextRoot} ${nextMode}` });
  };

  return (
    <div
      className="flex items-center gap-0.5 px-0.5"
      data-testid="toolbar-project-settings"
    >
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={bpmInput}
        onChange={(event) => setBpmInput(event.target.value)}
        onBlur={commitBpm}
        onKeyDown={blurOnEnter}
        min={40}
        max={300}
        disabled={disabled}
        aria-label="Project BPM"
        title="Project BPM"
        className={`${inputClass} w-[3.35rem]`}
      />

      <ToolbarSeparator />

      <div className="flex items-center">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={tsNumeratorInput}
          onChange={(event) => setTsNumeratorInput(event.target.value)}
          onBlur={commitTimeSignatureNumerator}
          onKeyDown={blurOnEnter}
          min={1}
          max={12}
          disabled={disabled}
          aria-label="Time signature numerator"
          title="Time signature numerator"
          className={`${inputClass} w-7`}
        />
        <span className="text-[10px] text-zinc-500">/</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={tsDenominatorInput}
          onChange={(event) => setTsDenominatorInput(event.target.value)}
          onBlur={commitTimeSignatureDenominator}
          onKeyDown={blurOnEnter}
          min={2}
          max={16}
          disabled={disabled}
          aria-label="Time signature denominator"
          title="Time signature denominator"
          className={`${inputClass} w-7`}
        />
      </div>

      <ToolbarSeparator />

      <div className="flex items-center gap-0.5">
        <select
          value={keyScale.root}
          onChange={(event) => updateKeyScale(event.target.value, keyScale.mode)}
          disabled={disabled}
          aria-label="Project key root"
          title="Project key root"
          className={`${selectClass} w-11`}
        >
          {KEY_ROOTS.map((root) => (
            <option key={root} value={root}>
              {KEY_ROOT_LABELS[root] ?? root}
            </option>
          ))}
        </select>
        <select
          value={keyScale.mode}
          onChange={(event) => updateKeyScale(keyScale.root, event.target.value)}
          disabled={disabled}
          aria-label="Project scale mode"
          title="Project scale mode"
          className={`${selectClass} w-[3.7rem]`}
        >
          {SCALE_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {SCALE_MODE_LABELS[mode] ?? `${mode[0].toUpperCase()}${mode.slice(1)}`}
            </option>
          ))}
        </select>
      </div>

      <ToolbarSeparator />

      <input
        type="number"
        value={measuresInput}
        onChange={(event) => setMeasuresInput(event.target.value)}
        onBlur={commitMeasures}
        onKeyDown={blurOnEnter}
        min={4}
        max={512}
        disabled={disabled}
        aria-label="Project measures"
        title="Project measures"
        className={`${inputClass} w-11`}
      />
    </div>
  );
}

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
    <div className="flex items-center gap-3 px-3 py-1 min-w-[200px] justify-center shrink-0 font-mono tabular-nums">
      <span className={`text-[13px] tracking-wider ${barsBeatsColor}`}>{displayBarsBeats}</span>
      <span className="text-[11px] text-zinc-500">{formatTime(currentTime)}</span>
      {countInActive && (
        <span className="text-[11px] text-red-400 animate-pulse">REC</span>
      )}
      {!countInActive && sessionArrangementRecording && (
        <span className="text-[11px] text-red-400 animate-pulse">SESSION REC</span>
      )}
      {showLoopCycleBadge && (
        <span
          className="text-[10px] font-semibold text-orange-400"
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
  return <div className="w-px h-5 bg-white/8" data-testid="toolbar-separator" />;
}

function AceStudioLink() {
  return (
    <a
      href="https://acestudio.ai/"
      target="_blank"
      rel="noreferrer"
      title="Visit ACE Studio"
      data-testid="toolbar-acestudio-link"
      className="flex items-center gap-1 rounded px-1 py-1 text-[11px] text-zinc-400 transition-colors hover:bg-daw-hover-subtle hover:text-zinc-200"
    >
      <img src="/acestudio_icon.png" alt="ACE Studio" className="h-5 w-5 rounded-full object-cover" />
      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 3.5L9 7L4 10.5" />
        <path d="M9.5 3.5L12 7L9.5 10.5" />
      </svg>
    </a>
  );
}

function ProjectMenu({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const setShowProjectListDialog = useUIStore((s) => s.setShowProjectListDialog);
  const setShowNewProjectDialog = useUIStore((s) => s.setShowNewProjectDialog);
  const setShowExportDialog = useUIStore((s) => s.setShowExportDialog);
  const showUndoHistoryPanel = useUIStore((s) => s.showUndoHistoryPanel);
  const setShowUndoHistoryPanel = useUIStore((s) => s.setShowUndoHistoryPanel);
  const setShowShareDialog = useCollaborationStore((s) => s.setShowShareDialog);
  const { openFilePicker } = useAudioImport();

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuPosition({
      top: rect.bottom + 6,
      left: rect.left,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function closeMenu() {
      setOpen(false);
    }

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const clickedTrigger = triggerRef.current?.contains(target);
      const clickedMenu = menuRef.current?.contains(target);
      if (!clickedTrigger && !clickedMenu) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [open]);

  const menuItemClass = "w-full text-left px-3 py-1.5 text-[11px] text-zinc-300 transition-colors hover:bg-daw-hover-subtle hover:text-white";

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        data-testid="project-menu-trigger"
        className="flex items-center justify-center rounded px-1.5 py-1 text-zinc-400 transition-colors hover:bg-daw-hover-subtle hover:text-white"
        title="Project menu"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
          <path d="M1.5 4.5L7 1.5l5.5 3M1.5 7l5.5 3 5.5-3M1.5 9.5l5.5 3 5.5-3" />
        </svg>
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[100] w-48 rounded-lg border border-daw-border bg-daw-surface-2 py-1 shadow-2xl"
          style={{ top: menuPosition.top, left: menuPosition.left }}
          data-testid="project-menu-dropdown"
        >
          <button
            onClick={() => { setShowProjectListDialog(true); setOpen(false); }}
            className={menuItemClass}
          >
            Projects
          </button>
          <button
            onClick={() => { setShowNewProjectDialog(true); setOpen(false); }}
            className={menuItemClass}
          >
            New Project
          </button>
          <div className="my-1 h-px w-full bg-daw-border/80" />
          <button
            onClick={() => { setShowExportDialog(true); setOpen(false); }}
            className={menuItemClass}
            disabled={disabled}
          >
            Export Audio
          </button>
          <button
            onClick={() => { useProjectStore.getState().exportProjectMidi(); setOpen(false); }}
            className={menuItemClass}
            disabled={disabled}
          >
            Export MIDI
          </button>
          <button
            onClick={() => { openFilePicker(); setOpen(false); }}
            className={menuItemClass}
            disabled={disabled}
          >
            Import Audio/MIDI
          </button>
          <div className="my-1 h-px w-full bg-daw-border/80" />
          <button
            onClick={() => { setShowUndoHistoryPanel(!showUndoHistoryPanel); setOpen(false); }}
            className={menuItemClass}
            disabled={disabled}
          >
            Undo History
          </button>
          <button
            onClick={() => { setShowShareDialog(true); setOpen(false); }}
            className={menuItemClass}
            disabled={disabled}
          >
            Share Project
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

export function Toolbar() {
  const project = useProjectStore((s) => s.project);
  const openCommandPalette = useUIStore((s) => s.openCommandPalette);
  const mainView = useUIStore((s) => s.mainView);
  const setMainView = useUIStore((s) => s.setMainView);
  const showSmartControls = useUIStore((s) => s.showSmartControls);
  const setShowSmartControls = useUIStore((s) => s.setShowSmartControls);
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
    <div
      className="flex h-11 items-center gap-1 border-b border-daw-border-strong bg-daw-surface-3 px-2 shrink-0 select-none overflow-x-auto"
      style={{ scrollbarWidth: 'none' }}
    >
      {/* Project menu (unified: Projects, New, File actions) */}
      <ProjectMenu disabled={!project} />

      <ToolbarSeparator />

      {/* Arrangement / Session view toggle */}
      <div className="flex items-center gap-0.5 shrink-0">
        <ControlBarButton
          active={mainView === 'arrangement'}
          onClick={() => setMainView('arrangement')}
          title="Arrangement View (Tab)"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M2 4h10M2 7h10M2 10h10" />
          </svg>
        </ControlBarButton>
        <ControlBarButton
          active={mainView === 'session'}
          onClick={() => setMainView('session')}
          title="Session View (Tab)"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 2v10M7 2v10M10 2v10" />
          </svg>
        </ControlBarButton>
      </div>

      <ToolbarSeparator />

      {/* Smart Controls toggle */}
      <div className="flex items-center gap-0.5 shrink-0" data-testid="toolbar-group">
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

      <div className="flex-1" />

      {/* Project settings (BPM, time sig, key, measures) */}
      <ProjectSettingsStrip disabled={!project} />

      <ToolbarSeparator />

      {/* Center: Transport controls */}
      <div
        className="flex items-center gap-0.5 shrink-0"
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
        {/* Play/Pause */}
        <button
          onClick={() => void (isPlaying ? pause() : play())}
          className={`w-8 h-7 flex items-center justify-center rounded transition-[color,background-color,transform] duration-150 active:scale-95 ${
            isPlaying
              ? 'bg-daw-accent text-white'
              : 'text-zinc-400 hover:bg-daw-hover-subtle hover:text-white'
          }`}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {isPlaying ? (
            <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
              <rect width="4" height="14" rx="1" />
              <rect x="8" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
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
      <div className="flex items-center gap-0.5 shrink-0" data-testid="toolbar-group">
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
      </div>

      <div className="flex-1" />

      {/* Command Palette + ACE Studio */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => openCommandPalette()}
          className="flex items-center gap-1 rounded px-1.5 py-1 text-zinc-400 transition-colors hover:bg-daw-hover-subtle hover:text-white"
          title="Command Palette (Cmd/Ctrl+K)"
          aria-label="Open command palette"
          data-onboarding-target="command-palette-button"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
            <circle cx="6" cy="6" r="3.75" />
            <path d="M8.8 8.8L12 12" strokeLinecap="round" />
          </svg>
        </button>
        <AceStudioLink />
      </div>

      {/* Viewer mode badge */}
      {isViewerMode && (
        <div className="px-2 py-0.5 text-[10px] font-medium text-amber-400" title="Read-only viewer mode">
          VIEWER
        </div>
      )}
    </div>
  );
}
