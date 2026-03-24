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

function getMetronomePulseCount(timeSignatureNumerator?: number) {
  const numerator = Math.max(1, Math.floor(timeSignatureNumerator ?? 4));
  return Math.min(6, Math.max(2, numerator));
}

const METRONOME_PULSE_POSITIONS: Record<number, Array<{ left: number; top: number }>> = {
  2: [
    { left: 26, top: 50 },
    { left: 74, top: 50 },
  ],
  3: [
    { left: 50, top: 20 },
    { left: 77, top: 72 },
    { left: 23, top: 72 },
  ],
  4: [
    { left: 24, top: 24 },
    { left: 76, top: 24 },
    { left: 76, top: 76 },
    { left: 24, top: 76 },
  ],
  5: [
    { left: 50, top: 16 },
    { left: 79, top: 35 },
    { left: 69, top: 78 },
    { left: 31, top: 78 },
    { left: 21, top: 35 },
  ],
  6: [
    { left: 50, top: 14 },
    { left: 78, top: 30 },
    { left: 78, top: 70 },
    { left: 50, top: 86 },
    { left: 22, top: 70 },
    { left: 22, top: 30 },
  ],
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

const numericDisplayInputClass = 'h-8 bg-transparent px-0 text-center font-mono text-[22px] leading-none tracking-[0.005em] text-white focus:text-white focus:outline-none disabled:opacity-50';
const selectClass = 'h-8 appearance-none bg-transparent px-0 font-mono text-[19px] leading-none tracking-[0.005em] text-white focus:text-white focus:outline-none disabled:opacity-50';
const boxedReadoutClass = 'flex h-8 items-center bg-transparent px-0';
const flatReadoutClass = 'flex h-8 items-center px-0';

function ProjectTimingStrip({ disabled }: { disabled: boolean }) {
  const project = useProjectStore((s) => s.project);
  const updateProject = useProjectStore((s) => s.updateProject);
  const [bpmInput, setBpmInput] = useState('120');
  const [tsNumeratorInput, setTsNumeratorInput] = useState('4');
  const [tsDenominatorInput, setTsDenominatorInput] = useState('4');

  useEffect(() => {
    if (!project) return;
    setBpmInput(String(project.bpm));
    setTsNumeratorInput(String(project.timeSignature ?? 4));
    setTsDenominatorInput(String(project.timeSignatureDenominator ?? 4));
  }, [project?.bpm, project?.timeSignature, project?.timeSignatureDenominator, project]);

  const commitBpm = () => {
    const parsed = Number.parseInt(bpmInput, 10);
    const nextBpm = Number.isNaN(parsed) ? (project?.bpm ?? 120) : Math.min(300, Math.max(40, parsed));
    setBpmInput(String(nextBpm));
    if (project && nextBpm !== project.bpm) {
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
    }
  };

  const blurOnEnter = (event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
  };

  return (
    <div
      className="flex items-center gap-2 px-0"
      data-testid="toolbar-project-timing"
    >
      <div className={boxedReadoutClass} title="Project tempo (beats per minute)">
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
          className={`${numericDisplayInputClass} w-[3.4rem]`}
        />
      </div>

      <div className={`${boxedReadoutClass} gap-[0.18rem]`} title="Project time signature">
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
          className={`${numericDisplayInputClass} w-[0.95rem]`}
        />
        <span className="text-[20px] leading-none text-zinc-500">/</span>
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
          className={`${numericDisplayInputClass} w-[0.95rem]`}
        />
      </div>

    </div>
  );
}

function HarmonySettingsStrip({ disabled }: { disabled: boolean }) {
  const project = useProjectStore((s) => s.project);
  const updateProject = useProjectStore((s) => s.updateProject);
  const keyScale = splitKeyScale(project?.keyScale);

  const updateKeyScale = (nextRoot: string, nextMode: string) => {
    if (!project) return;
    updateProject({ keyScale: `${nextRoot} ${nextMode}` });
  };

  return (
    <div
      className="flex items-center gap-1.5 px-0"
      data-testid="toolbar-project-harmony"
    >
      <div className={flatReadoutClass} title="Project key root note">
        <select
          value={keyScale.root}
          onChange={(event) => updateKeyScale(event.target.value, keyScale.mode)}
          disabled={disabled}
          aria-label="Project key root"
          title="Project key root"
          className={`${selectClass} w-[1rem]`}
        >
          {KEY_ROOTS.map((root) => (
            <option key={root} value={root}>
              {KEY_ROOT_LABELS[root] ?? root}
            </option>
          ))}
        </select>
      </div>
      <div className={flatReadoutClass} title="Project scale mode selector">
        <select
          value={keyScale.mode}
          onChange={(event) => updateKeyScale(keyScale.root, event.target.value)}
          disabled={disabled}
          aria-label="Project scale mode"
          title="Project scale mode"
          className={`${selectClass} w-[2.5rem]`}
        >
          {SCALE_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {SCALE_MODE_LABELS[mode] ?? `${mode[0].toUpperCase()}${mode.slice(1)}`}
            </option>
          ))}
        </select>
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
    <div className="flex min-w-[220px] shrink-0 items-end justify-center gap-2.5 px-2 py-1 font-mono tabular-nums">
      <span
        className={`text-[22px] leading-none tracking-[0.09em] ${barsBeatsColor}`}
        title="Transport position (bars.beats.ticks)"
      >
        {displayBarsBeats}
      </span>
      <span
        className="pb-[1px] text-[15px] leading-none tracking-[0.02em] text-zinc-500"
        title="Transport elapsed time"
      >
        {formatTime(currentTime)}
      </span>
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

  const pulseCount = getMetronomePulseCount(project?.timeSignature);
  const pulsePositions = METRONOME_PULSE_POSITIONS[pulseCount];

  let activeIndex = 0;
  if (project) {
    const totalBeats = timeToBeat(currentTime, project.tempoMap, project.bpm);
    const fallbackDenominator = project.timeSignatureDenominator ?? 4;
    const bar = getBarAtBeat(totalBeats, project.timeSignatureMap, project.timeSignature, fallbackDenominator);
    const barStartBeat = getBeatAtBar(bar, project.timeSignatureMap, project.timeSignature, fallbackDenominator);
    const nextBarBeat = getBeatAtBar(bar + 1, project.timeSignatureMap, project.timeSignature, fallbackDenominator);
    const barLength = Math.max(0.0001, nextBarBeat - barStartBeat);
    const progress = Math.max(0, Math.min(0.9999, (totalBeats - barStartBeat) / barLength));
    activeIndex = Math.min(pulseCount - 1, Math.floor(progress * pulseCount));
  }

  return (
    <div
      className="relative h-6 w-6"
      aria-hidden="true"
      data-testid="metronome-pulse-icon"
    >
      {pulsePositions.map((position, index) => {
        const dotState = !isPlaying
          ? (index === 0 ? 'current' : 'upcoming')
          : index === activeIndex
            ? 'current'
            : index < activeIndex
              ? 'passed'
              : 'upcoming';

        const dotClassName = dotState === 'current'
          ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.35)]'
          : dotState === 'passed'
            ? 'bg-white/55'
            : 'bg-white/22';

        return (
          <span
            key={index}
            data-testid="metronome-pulse-dot"
            data-step-index={index}
            data-state={dotState}
            className={`absolute block h-[9.5px] w-[9.5px] rounded-full transition-[background-color,box-shadow] duration-100 ${dotClassName}`}
            style={{
              left: `${position.left}%`,
              top: `${position.top}%`,
              transform: 'translate(-50%, -50%)',
            }}
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
  const hoverClass = active || disableHoverHighlight
    ? ''
    : 'hover:bg-transparent hover:text-white';

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
      className={`h-10 w-10 rounded-lg p-0 text-white/90 ${hoverClass} ${className ?? ''}`}
    >
      {children}
    </Button>
  );
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
        aria-label="Project menu"
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
  const strudelPanelOpen = useUIStore((s) => s.strudelPanelOpen);
  const toggleStrudelPanel = useUIStore((s) => s.toggleStrudelPanel);
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
      className="flex h-12 shrink-0 select-none items-center gap-1.5 overflow-x-auto border-b border-black/40 bg-[#1f2226] px-2.5"
      data-testid="main-toolbar"
      style={{ scrollbarWidth: 'none' }}
    >
      {/* Project menu (unified: Projects, New, File actions) */}
      <ProjectMenu disabled={!project} />

      {/* Arrangement / Session view toggle */}
      <div className="flex items-center gap-1 shrink-0">
        <ControlBarButton
          active={mainView === 'arrangement'}
          onClick={() => setMainView('arrangement')}
          title="Arrangement View (Tab)"
        >
          <svg width="23" height="23" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <path d="M2 4h10M2 7h10M2 10h10" />
          </svg>
        </ControlBarButton>
        <ControlBarButton
          active={mainView === 'session'}
          onClick={() => setMainView('session')}
          title="Session View (Tab)"
        >
          <svg width="23" height="23" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <path d="M4 2v10M7 2v10M10 2v10" />
          </svg>
        </ControlBarButton>
      </div>

      {/* Smart Controls toggle */}
      <div className="flex items-center gap-1 shrink-0" data-testid="toolbar-group">
        <ControlBarButton
          active={showArrangementMarkers}
          onClick={toggleArrangementMarkers}
          title="Arrangement Markers (A)"
          disabled={!project}
        >
          <svg width="23" height="23" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
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
          <svg width="23" height="23" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="4" cy="7" r="2.5" />
            <circle cx="10" cy="7" r="2.5" />
            <line x1="4" y1="4.5" x2="4" y2="2" />
            <line x1="10" y1="4.5" x2="10" y2="2" />
          </svg>
        </ControlBarButton>
      </div>

      {/* Strudel REPL toggle — ꩜ spiral */}
      <ControlBarButton
        active={strudelPanelOpen}
        onClick={toggleStrudelPanel}
        title="Strudel REPL — Live-code music patterns"
        disabled={!project}
      >
        <span className="text-[15px] leading-none" style={{ fontFamily: 'system-ui' }}>꩜</span>
      </ControlBarButton>

      <div className="flex-1" />

      {/* Project timing settings */}
      <ProjectTimingStrip disabled={!project} />

      {/* Center: Transport controls */}
      <div className="shrink-0" data-testid="toolbar-group">
      <div
        className="flex items-center gap-1"
        data-testid="transport-bar"
        data-onboarding-target="transport"
      >
        {/* Rewind */}
        <ControlBarButton onClick={() => void stop()} title="Go to Beginning (Enter)">
          <svg width="22" height="20" viewBox="0 0 14 12" fill="currentColor">
            <rect x="0" y="1" width="2" height="10" rx="0.5" />
            <path d="M13 1L5 6l8 5V1z" />
          </svg>
        </ControlBarButton>
        {/* Play/Pause */}
        <button
          onClick={() => void (isPlaying ? pause() : play())}
          className={`flex h-10 w-11 items-center justify-center rounded-xl transition-[color,background-color,transform] duration-150 active:scale-95 ${
            isPlaying
              ? 'bg-daw-accent text-white'
              : 'bg-transparent text-white/90 hover:bg-transparent hover:text-white'
          }`}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg width="21" height="23" viewBox="0 0 12 14" fill="currentColor">
              <rect width="4" height="14" rx="1" />
              <rect x="8" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="23" height="25" viewBox="0 0 12 14" fill="currentColor">
              <path d="M0 0L12 7L0 14V0Z" />
            </svg>
          )}
        </button>
        <ControlBarButton onClick={() => void toggleRecord()} title="Record (R)" active={isRecording}>
          <div className={`h-[20px] w-[20px] rounded-full bg-red-500 ${isRecording ? 'animate-pulse' : 'opacity-70'}`} />
        </ControlBarButton>
        <button
          onClick={toggleMetronome}
          title="Metronome (K)"
          aria-label="Metronome"
          className={`flex h-10 w-10 items-center justify-center rounded-xl transition-[color,background-color,transform] duration-150 active:scale-95 ${
            metronomeEnabled
              ? 'bg-[#8276f6] text-white'
              : 'bg-transparent text-white/90 hover:bg-transparent hover:text-white'
          }`}
        >
          <MetronomePulseIcon />
        </button>
        <ControlBarButton
          active={loopEnabled}
          onClick={toggleLoop}
          title="Loop (C)"
          disableHoverHighlight
        >
          <svg width="22" height="22" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
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
          <svg width="22" height="22" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 7h7.5" />
            <path d="M7 4l3.5 3L7 10" />
            <path d="M12 2v10" />
          </svg>
        </ControlBarButton>
      </div>
      </div>

      {/* LCD Display */}
      <LCDDisplay />

      <div className="flex-1" />

      <HarmonySettingsStrip disabled={!project} />

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
