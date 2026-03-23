import { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useTransportStore } from '../../store/transportStore';
import { useCollaborationStore } from '../../store/collaborationStore';
import { useAudioImport } from '../../hooks/useAudioImport';
import { useTransport } from '../../hooks/useTransport';
import { useRecording } from '../../hooks/useRecording';
import { KEY_SCALES } from '../../constants/tracks';
import { formatTime, formatBarsBeats } from '../../utils/time';
import { clampTimelinePixelsPerSecond } from '../../utils/timelineZoom';
import { getBarAtBeat, getBeatAtBar, timeToBeat } from '../../utils/tempoMap';
import { Button } from '../ui/Button';

const KEY_ROOT_LABELS: Record<string, string> = {
  C: 'C',
  'C#': 'C#',
  D: 'D',
  'D#': 'D#',
  E: 'E',
  F: 'F',
  'F#': 'F#',
  G: 'G',
  'G#': 'G#',
  A: 'A',
  'A#': 'A#',
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

const numericDisplayInputClass = 'h-8 bg-transparent px-0 text-center font-mono text-[18px] leading-none tracking-[0.01em] text-white focus:text-white focus:outline-none disabled:opacity-50';
const selectClass = 'h-8 appearance-none bg-transparent px-0 font-mono text-[17px] leading-none tracking-[0.01em] text-white focus:text-white focus:outline-none disabled:opacity-50';
const boxedReadoutClass = 'flex h-8 items-center rounded-[13px] border border-white/10 bg-white/[0.05] px-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors hover:bg-white/[0.08]';
const flatReadoutClass = 'relative flex h-8 items-center rounded-md px-1.5 transition-colors hover:bg-white/6';

function ChevronDown({ className = '' }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M3.5 5.25L7 8.75L10.5 5.25" />
    </svg>
  );
}

function ProjectSettingsStrip({ disabled }: { disabled: boolean }) {
  const project = useProjectStore((s) => s.project);
  const updateProject = useProjectStore((s) => s.updateProject);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const setPixelsPerSecond = useUIStore((s) => s.setPixelsPerSecond);
  const zoomTimelineToProject = useUIStore((s) => s.zoomTimelineToProject);
  const [bpmInput, setBpmInput] = useState('120');
  const [tsNumeratorInput, setTsNumeratorInput] = useState('4');
  const [tsDenominatorInput, setTsDenominatorInput] = useState('4');

  useEffect(() => {
    if (!project) return;
    setBpmInput(String(project.bpm));
    setTsNumeratorInput(String(project.timeSignature ?? 4));
    setTsDenominatorInput(String(project.timeSignatureDenominator ?? 4));
  }, [project?.bpm, project?.timeSignature, project?.timeSignatureDenominator, project]);

  const keyScale = splitKeyScale(project?.keyScale);

  const commitBpm = () => {
    const parsed = Number.parseInt(bpmInput, 10);
    const nextBpm = Number.isNaN(parsed) ? (project?.bpm ?? 120) : Math.min(300, Math.max(40, parsed));
    setBpmInput(String(nextBpm));
    if (project && nextBpm !== project.bpm) {
      if (project.bpm > 0) {
        setPixelsPerSecond(clampTimelinePixelsPerSecond((pixelsPerSecond * nextBpm) / project.bpm));
      }
      updateProject({ bpm: nextBpm });
    }
  };

  const commitTimeSignatureNumerator = () => {
    const parsed = Number.parseInt(tsNumeratorInput, 10);
    const nextTs = Number.isNaN(parsed)
      ? (project?.timeSignature ?? 4)
      : Math.max(1, parsed);
    setTsNumeratorInput(String(nextTs));
    if (project && nextTs !== project.timeSignature) {
      updateProject({ timeSignature: nextTs });
      zoomTimelineToProject();
    }
  };

  const commitTimeSignatureDenominator = () => {
    const parsed = Number.parseInt(tsDenominatorInput, 10);
    const nextDenom = Number.isNaN(parsed) || parsed < 1
      ? (project?.timeSignatureDenominator ?? 4)
      : parsed;
    setTsDenominatorInput(String(nextDenom));
    if (project && nextDenom !== (project.timeSignatureDenominator ?? 4)) {
      updateProject({ timeSignatureDenominator: nextDenom });
      zoomTimelineToProject();
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
      <div className={boxedReadoutClass}>
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
          className={`${numericDisplayInputClass} w-[3.7rem]`}
        />
      </div>

      <ToolbarSeparator />

      <div className={`${boxedReadoutClass} gap-1.5 px-2`}>
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
          className={`${numericDisplayInputClass} w-[1.45rem]`}
        />
        <span className="text-[17px] leading-none text-zinc-500">/</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={tsDenominatorInput}
          onChange={(event) => setTsDenominatorInput(event.target.value)}
          onBlur={commitTimeSignatureDenominator}
          onKeyDown={blurOnEnter}
          disabled={disabled}
          aria-label="Time signature denominator"
          title="Time signature denominator"
          className={`${numericDisplayInputClass} w-[1.45rem]`}
        />
      </div>

      <ToolbarSeparator />

      <div className="flex items-center gap-0.5">
        <div className={`${flatReadoutClass} pr-5`}>
          <select
            value={keyScale.root}
            onChange={(event) => updateKeyScale(event.target.value, keyScale.mode)}
            disabled={disabled}
            aria-label="Project key root"
            title="Project key root"
            className={`${selectClass} w-[1.2rem]`}
          >
            {KEY_ROOTS.map((root) => (
              <option key={root} value={root}>
                {KEY_ROOT_LABELS[root] ?? root}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-zinc-300" />
        </div>
        <div className={`${flatReadoutClass} pr-5`}>
          <select
            value={keyScale.mode}
            onChange={(event) => updateKeyScale(keyScale.root, event.target.value)}
            disabled={disabled}
            aria-label="Project scale mode"
            title="Project scale mode"
            className={`${selectClass} w-[2.8rem]`}
          >
            {SCALE_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {SCALE_MODE_LABELS[mode] ?? `${mode[0].toUpperCase()}${mode.slice(1)}`}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-zinc-300" />
        </div>
      </div>
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
    ? formatBarsBeats(currentTime, project.bpm, project.timeSignature, project.tempoMap, project.timeSignatureMap, project.timeSignatureDenominator ?? 4)
    : '1.1.00';

  // During count-in: show negative beat count in cyan (Ableton convention)
  const displayBarsBeats = countInActive ? `${countInBeat}` : barsBeats;
  const barsBeatsColor = countInActive ? 'text-cyan-400 animate-pulse' : 'text-green-400';

  const showLoopCycleBadge = isRecording && loopRecordingEnabled && loopCycleCount > 0;

  return (
    <div className="flex min-w-[220px] shrink-0 items-end justify-center gap-3 px-2 py-1 font-mono tabular-nums">
      <span className={`text-[20px] leading-none tracking-[0.14em] ${barsBeatsColor}`}>{displayBarsBeats}</span>
      <span className="pb-[2px] text-[14px] leading-none text-zinc-500">{formatTime(currentTime)}</span>
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

function MetronomePulseIcon() {
  const project = useProjectStore((s) => s.project);
  const currentTime = useTransportStore((s) => s.currentTime);
  const isPlaying = useTransportStore((s) => s.isPlaying);

  const denominator = Math.max(1, Math.min(8, project?.timeSignatureDenominator ?? 4));
  const columns = denominator <= 4 ? 2 : 4;

  let activeIndex = 0;
  if (project) {
    const totalBeats = timeToBeat(currentTime, project.tempoMap, project.bpm);
    const fallbackDenominator = project.timeSignatureDenominator ?? 4;
    const bar = getBarAtBeat(totalBeats, project.timeSignatureMap, project.timeSignature, fallbackDenominator);
    const barStartBeat = getBeatAtBar(bar, project.timeSignatureMap, project.timeSignature, fallbackDenominator);
    const nextBarBeat = getBeatAtBar(bar + 1, project.timeSignatureMap, project.timeSignature, fallbackDenominator);
    const barLength = Math.max(0.0001, nextBarBeat - barStartBeat);
    const progress = Math.max(0, Math.min(0.9999, (totalBeats - barStartBeat) / barLength));
    activeIndex = Math.min(denominator - 1, Math.floor(progress * denominator));
  }

  return (
    <div
      className="grid h-5 w-5 gap-[3px]"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      aria-hidden="true"
      data-testid="metronome-pulse-icon"
    >
      {Array.from({ length: denominator }).map((_, index) => {
        const isFilled = isPlaying ? index <= activeIndex : index === 0;
        return (
          <span
            key={index}
            data-testid="metronome-pulse-dot"
            className={`block h-[7px] w-[7px] rounded-full transition-colors duration-100 ${
              isFilled ? 'bg-white' : 'bg-white/30'
            }`}
          />
        );
      })}
    </div>
  );
}

function ControlBarButton({
  active,
  onClick,
  title,
  disabled,
  dataTarget,
  className,
  disableHoverHighlight = false,
  children,
}: {
  active?: boolean;
  onClick: () => void | Promise<void>;
  title: string;
  disabled?: boolean;
  dataTarget?: string;
  className?: string;
  disableHoverHighlight?: boolean;
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
      className={`h-9 w-9 rounded-lg text-white ${disableHoverHighlight ? '' : 'hover:bg-white/8 hover:text-white'} ${className ?? ''}`}
    >
      {children}
    </Button>
  );
}

function ToolbarSeparator() {
  return <div className="h-6 w-px bg-white/10" data-testid="toolbar-separator" />;
}

function AceStudioLink() {
  return (
    <a
      href="https://acestudio.ai/"
      target="_blank"
      rel="noreferrer"
      title="Visit ACE Studio"
      data-testid="toolbar-acestudio-link"
      className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-zinc-100 transition-colors hover:bg-white/8 hover:text-white"
    >
      <img src="/acestudio_icon.png" alt="ACE Studio" className="h-5 w-5 rounded-full object-cover" />
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
        className="flex h-9 w-9 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/8 hover:text-white"
        title="Project menu"
      >
        <svg width="20" height="20" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.45">
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
  const showArrangementMarkers = useUIStore((s) => s.showArrangementMarkers);
  const toggleArrangementMarkers = useUIStore((s) => s.toggleArrangementMarkers);
  const autoScrollEnabled = useUIStore((s) => s.autoScrollEnabled);
  const toggleAutoScroll = useUIStore((s) => s.toggleAutoScroll);
  const isViewerMode = useCollaborationStore((s) => s.isViewerMode);
  const { toggleRecord } = useRecording();

  const { isPlaying, play, pause, stop } = useTransport();
  const loopEnabled = useTransportStore((s) => s.loopEnabled);
  const isRecording = useTransportStore((s) => s.isRecording);
  const toggleLoop = useTransportStore((s) => s.toggleLoop);
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
      className="flex h-12 shrink-0 select-none items-center gap-1 overflow-x-auto border-b border-black/40 bg-[#1f2226] px-2.5"
      data-testid="main-toolbar"
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
          <svg width="19" height="19" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <path d="M2 4h10M2 7h10M2 10h10" />
          </svg>
        </ControlBarButton>
        <ControlBarButton
          active={mainView === 'session'}
          onClick={() => setMainView('session')}
          title="Session View (Tab)"
        >
          <svg width="19" height="19" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <path d="M4 2v10M7 2v10M10 2v10" />
          </svg>
        </ControlBarButton>
      </div>

      <ToolbarSeparator />

      {/* Smart Controls toggle */}
      <div className="flex items-center gap-0.5 shrink-0" data-testid="toolbar-group">
        <ControlBarButton
          active={showArrangementMarkers}
          onClick={toggleArrangementMarkers}
          title="Arrangement Markers (A)"
          disabled={!project}
        >
          <svg width="19" height="19" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="1" y="5" width="4" height="5" rx="0.5" />
            <rect x="5" y="5" width="5" height="5" rx="0.5" />
            <rect x="10" y="5" width="3" height="5" rx="0.5" />
            <line x1="3" y1="5" x2="3" y2="3" />
            <line x1="7.5" y1="5" x2="7.5" y2="3" />
            <line x1="11.5" y1="5" x2="11.5" y2="3" />
          </svg>
        </ControlBarButton>
        <ControlBarButton
          active={showSmartControls}
          onClick={() => setShowSmartControls(!showSmartControls)}
          title="Smart Controls (B)"
          disabled={!project}
        >
          <svg width="19" height="19" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
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
      <div className="shrink-0" data-testid="toolbar-group">
      <div
        className="flex items-center gap-0.5"
        data-testid="transport-bar"
        data-onboarding-target="transport"
      >
        {/* Rewind */}
        <ControlBarButton onClick={() => void stop()} title="Go to Beginning (Enter)">
          <svg width="17" height="15" viewBox="0 0 14 12" fill="currentColor">
            <rect x="0" y="1" width="2" height="10" rx="0.5" />
            <path d="M13 1L5 6l8 5V1z" />
          </svg>
        </ControlBarButton>
        {/* Play/Pause */}
        <button
          onClick={() => void (isPlaying ? pause() : play())}
          className={`flex h-9 w-11 items-center justify-center rounded-xl transition-[color,background-color,transform] duration-150 active:scale-95 ${
            isPlaying
              ? 'bg-daw-accent text-white'
              : 'bg-white/8 text-white hover:bg-white/12 hover:text-white'
          }`}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {isPlaying ? (
            <svg width="16" height="18" viewBox="0 0 12 14" fill="currentColor">
              <rect width="4" height="14" rx="1" />
              <rect x="8" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="18" height="20" viewBox="0 0 12 14" fill="currentColor">
              <path d="M0 0L12 7L0 14V0Z" />
            </svg>
          )}
        </button>
        <ControlBarButton onClick={() => void toggleRecord()} title="Record (R)" active={isRecording}>
          <div className={`h-4 w-4 rounded-full bg-red-500 ${isRecording ? 'animate-pulse' : 'opacity-70'}`} />
        </ControlBarButton>
        <button
          onClick={toggleMetronome}
          title="Metronome (K)"
          aria-label="Metronome"
          className={`flex h-9 w-9 items-center justify-center rounded-xl transition-[color,background-color,transform] duration-150 active:scale-95 ${
            metronomeEnabled
              ? 'bg-[#8276f6] text-white'
              : 'bg-white/8 text-white hover:bg-white/12 hover:text-white'
          }`}
        >
          <MetronomePulseIcon />
        </button>
        <ControlBarButton active={loopEnabled} onClick={toggleLoop} title="Loop (C)">
          <svg width="19" height="19" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 1l2 2-2 2" />
            <path d="M4 13l-2-2 2-2" />
            <path d="M12 3H5a3 3 0 0 0 0 6" />
            <path d="M2 11h7a3 3 0 0 0 0-6" />
          </svg>
        </ControlBarButton>
        <ControlBarButton
          active={autoScrollEnabled}
          onClick={toggleAutoScroll}
          title="Auto Scroll"
          disableHoverHighlight
        >
          <svg width="19" height="19" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 7h7.5" />
            <path d="M7 4l3.5 3L7 10" />
            <path d="M12 2v10" />
          </svg>
        </ControlBarButton>
      </div>
      </div>

      <ToolbarSeparator />

      {/* LCD Display */}
      <LCDDisplay />

      <div className="flex-1" />

      {/* Command Palette + ACE Studio */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => openCommandPalette()}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/8 hover:text-white"
          title="Command Palette (Cmd/Ctrl+K)"
          aria-label="Open command palette"
          data-onboarding-target="command-palette-button"
        >
          <svg width="19" height="19" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
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
