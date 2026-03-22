import type { Project, ReverbParams, Track, TrackEffect, TrackEffectType, TrackName, TrackType } from '../types/project';

export type CommandPaletteCommandKind = 'action' | 'setting' | 'parameter';

export interface CommandPaletteRegistryEntry {
  id: string;
  kind: CommandPaletteCommandKind;
  title: string;
  section: string;
  subtitle?: string;
  shortcut?: string[];
  keywords: string[];
  aliases: string[];
  searchText: string;
}

export interface CommandPaletteCommand {
  id: string;
  kind: CommandPaletteCommandKind;
  title: string;
  section: string;
  subtitle?: string;
  shortcut?: string[];
  keywords: string[];
  aliases: string[];
  searchText: string;
  execute: () => void | Promise<void>;
}

export interface CommandPaletteSearchResult extends CommandPaletteCommand {
  score: number;
  isRecent: boolean;
}

export interface CommandPaletteContext {
  project: Project | null;
  selectedClipIds: string[];
  currentTime: number;
  isPlaying: boolean;
  showMixer: boolean;
  showLibrary: boolean;
  showSmartControls: boolean;
  showAIAssistant: boolean;
  loopBrowserOpen: boolean;
  showTempoLane: boolean;
  loopEnabled: boolean;
  metronomeEnabled: boolean;
  expandedTrackId: string | null;
  openPianoRollTrackId: string | null;
  openSequencerTrackId: string | null;
  openDrumMachineTrackId: string | null;
  actions: {
    play: () => void | Promise<void>;
    pause: () => void | Promise<void>;
    stop: () => void | Promise<void>;
    toggleLoop: () => void;
    toggleMetronome: () => void;
    setShowNewProjectDialog: (v: boolean) => void;
    setShowProjectListDialog: (v: boolean) => void;
    openGenerationSettings: () => void;
    setShowExportDialog: (v: boolean) => void;
    setShowKeyboardShortcutsDialog: (v: boolean) => void;
    setShowLibrary: (v: boolean) => void;
    setShowMixer: (v: boolean) => void;
    setShowSmartControls: (v: boolean) => void;
    toggleLoopBrowser: () => void;
    toggleTempoLane: () => void;
    toggleAIAssistant: () => void;
    zoomTimelineToSelection: () => void;
    zoomTimelineToProject: () => void;
    setBatchGenerateMode: (mode: 'silence' | 'context' | null) => void;
    addTrack: (trackName: TrackName, trackType?: TrackType) => Track;
    addTrackEffect: (trackId: string, type: TrackEffectType) => string | undefined;
    updateProject: (updates: Partial<Pick<Project, 'bpm'>>) => void;
    updateTrack: (trackId: string, updates: Partial<Pick<Track, 'volume' | 'muted' | 'soloed'>>) => void;
    updateTrackMixer: (trackId: string, updates: Partial<Pick<Track, 'pan'>>) => void;
    updateTrackEffect: (trackId: string, effectId: string, updates: Partial<TrackEffect>) => void;
    duplicateClip: (clipId: string) => void;
    splitClip: (clipId: string, splitTime: number) => void;
    splitClipAtZeroCrossing: (clipId: string, splitTime: number) => Promise<void>;
    removeClip: (clipId: string) => void;
    setEditingClip: (clipId: string | null) => void;
    deselectAll: () => void;
  };
}

const DEFAULT_RESULT_LIMIT = 12;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return normalize(value).split(' ').filter(Boolean);
}

function buildSearchCorpus(command: CommandPaletteCommand): string {
  return command.searchText;
}

function getTrackForSelection(context: CommandPaletteContext): Track | null {
  const project = context.project;
  if (!project) return null;

  const candidateTrackId =
    context.openPianoRollTrackId ??
    context.openSequencerTrackId ??
    context.openDrumMachineTrackId ??
    context.expandedTrackId;

  if (candidateTrackId) {
    return project.tracks.find((track) => track.id === candidateTrackId) ?? null;
  }

  const selectedClipId = context.selectedClipIds[0];
  if (!selectedClipId) return null;

  return project.tracks.find((track) => track.clips.some((clip) => clip.id === selectedClipId)) ?? null;
}

function createTrackCommand(
  id: string,
  title: string,
  section: string,
  kind: CommandPaletteCommandKind,
  keywords: string[],
  aliases: string[],
  execute: () => void | Promise<void>,
  shortcut?: string[],
  subtitle?: string,
): CommandPaletteCommand {
  return {
    id,
    kind,
    title,
    section,
    subtitle,
    shortcut,
    keywords,
    aliases,
    searchText: normalize([
      title,
      section,
      subtitle ?? '',
      ...keywords,
      ...aliases,
    ].join(' ')),
    execute,
  };
}

function buildTempoCommand(context: CommandPaletteContext, bpm: number): CommandPaletteCommand | null {
  if (!context.project) return null;
  if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240) return null;

  return createTrackCommand(
    `project:set-tempo:${bpm}`,
    `Set Tempo to ${bpm} BPM`,
    'Project',
    'setting',
    ['tempo', 'bpm', 'project setting', String(bpm)],
    [`tempo ${bpm}`, `bpm ${bpm}`, `set tempo to ${bpm}`, `set bpm to ${bpm}`],
    () => context.actions.updateProject({ bpm }),
    undefined,
    'Project setting',
  );
}

function createTrackParameterCommand(
  id: string,
  title: string,
  keywords: string[],
  aliases: string[],
  execute: () => void | Promise<void>,
  shortcut?: string[],
  subtitle?: string,
): CommandPaletteCommand {
  return createTrackCommand(id, title, 'Parameters', 'parameter', keywords, aliases, execute, shortcut, subtitle);
}

function clampVolumePercent(percent: number): number {
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function clampPanValue(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function formatPanLabel(value: number): string {
  if (value <= -0.99) return 'Hard Left';
  if (value >= 0.99) return 'Hard Right';
  if (Math.abs(value) < 0.001) return 'Center';
  return `${value < 0 ? 'Left' : 'Right'} ${Math.round(Math.abs(value) * 100)}%`;
}

function formatPanAlias(value: number): string {
  if (value <= -0.99) return 'left';
  if (value >= 0.99) return 'right';
  if (Math.abs(value) < 0.001) return 'center';
  return value < 0 ? `left ${Math.round(Math.abs(value) * 100)}` : `right ${Math.round(Math.abs(value) * 100)}`;
}

function buildTrackNameAliases(track: Track): string[] {
  const normalizedDisplayName = normalize(track.displayName);
  const collapsedDisplayName = normalizedDisplayName.replace(/\s+/g, '');
  const normalizedTrackName = normalize(track.trackName.replace(/_/g, ' '));
  return Array.from(new Set([track.displayName.toLowerCase(), normalizedDisplayName, collapsedDisplayName, normalizedTrackName].filter(Boolean)));
}

function trackMatchesQuery(track: Track, query: string): boolean {
  const normalizedQuery = normalize(query);
  return buildTrackNameAliases(track).some((alias) => normalizedQuery.includes(alias));
}

function getMatchedTracks(context: CommandPaletteContext, query: string): Track[] {
  const tracks = context.project?.tracks ?? [];
  const matches = tracks.filter((track) => trackMatchesQuery(track, query));
  if (matches.length > 0) return matches;
  const selectedTrack = getTrackForSelection(context);
  return selectedTrack ? [selectedTrack] : [];
}

function ensureTrackEffect(
  context: CommandPaletteContext,
  trackId: string,
  type: TrackEffectType,
): { effectId: string; created: boolean } | null {
  const track = context.project?.tracks.find((item) => item.id === trackId);
  if (!track) return null;

  const existing = (track.effects ?? []).find((effect) => effect.type === type);
  if (existing) {
    return { effectId: existing.id, created: false };
  }

  const effectId = context.actions.addTrackEffect(trackId, type);
  if (!effectId) return null;
  return { effectId, created: true };
}

function getReverbParamsForTrack(context: CommandPaletteContext, trackId: string, effectId: string): ReverbParams {
  const track = context.project?.tracks.find((item) => item.id === trackId);
  const effect = track?.effects?.find((item) => item.id === effectId && item.type === 'reverb');
  if (effect?.type === 'reverb') {
    return effect.params;
  }
  return { decay: 2.4, preDelay: 0.02, wet: 0.25 };
}

function buildDynamicTrackParameterCommands(query: string, context: CommandPaletteContext): CommandPaletteCommand[] {
  const normalized = normalize(query);
  const rawQuery = query.toLowerCase();
  const tracks = getMatchedTracks(context, query);
  if (!normalized || tracks.length === 0) return [];

  const commands: CommandPaletteCommand[] = [];

  if (normalized.includes('volume')) {
    const volumeMatch = rawQuery.match(/\b(\d{1,3})(?:\s*(?:%|percent))?\b/);
    if (volumeMatch) {
      const volumePercent = clampVolumePercent(Number(volumeMatch[1]));
      for (const track of tracks) {
        commands.push(
          createTrackParameterCommand(
            `track:${track.id}:volume:${volumePercent}`,
            `Set ${track.displayName} Volume to ${volumePercent}%`,
            ['track', track.displayName, 'volume', `${volumePercent}%`, 'gain', 'level'],
            [
              `${track.displayName.toLowerCase()} volume ${volumePercent}`,
              `set ${track.displayName.toLowerCase()} volume to ${volumePercent}`,
              `${track.displayName.toLowerCase()} level ${volumePercent}`,
            ],
            () => context.actions.updateTrack(track.id, { volume: volumePercent / 100 }),
            undefined,
            'Track parameter',
          ),
        );
      }
    }
  }

  if (normalized.includes('pan')) {
    const numericPanMatch = rawQuery.match(/\bpan(?:\s+to)?\s+(-?\d{1,3})\b/);
    const leftMatch = normalized.includes('left');
    const rightMatch = normalized.includes('right');
    const centerMatch = normalized.includes('center') || normalized.includes('centre');
    const derivedPan = numericPanMatch
      ? clampPanValue(Number(numericPanMatch[1]) / 100)
      : centerMatch
        ? 0
        : leftMatch
          ? -1
          : rightMatch
            ? 1
            : null;

    if (derivedPan !== null) {
      for (const track of tracks) {
        const label = formatPanLabel(derivedPan);
        commands.push(
          createTrackParameterCommand(
            `track:${track.id}:pan:${Math.round(derivedPan * 100)}`,
            `Pan ${track.displayName} ${label}`,
            ['track', track.displayName, 'pan', label.toLowerCase(), 'stereo'],
            [
              `${track.displayName.toLowerCase()} pan ${formatPanAlias(derivedPan)}`,
              `pan ${track.displayName.toLowerCase()} ${formatPanAlias(derivedPan)}`,
            ],
            () => context.actions.updateTrackMixer(track.id, { pan: derivedPan }),
            undefined,
            'Track parameter',
          ),
        );
      }
    }
  }

  if (normalized.includes('reverb') && normalized.includes('decay')) {
    const decayMatch = rawQuery.match(/\b(\d+(?:\.\d+)?)\b/);
    if (decayMatch) {
      const decay = Math.max(0.1, Math.min(20, Number(decayMatch[1])));
      for (const track of tracks) {
        commands.push(
          createTrackParameterCommand(
            `track:${track.id}:reverb-decay:${decay}`,
            `Set ${track.displayName} Reverb Decay to ${decay}s`,
            ['track', track.displayName, 'reverb', 'decay', `${decay}`],
            [
              `${track.displayName.toLowerCase()} reverb decay ${decay}`,
              `set reverb decay on ${track.displayName.toLowerCase()} to ${decay}`,
            ],
            () => {
              const resolved = ensureTrackEffect(context, track.id, 'reverb');
              if (!resolved) return;
              context.actions.updateTrackEffect(track.id, resolved.effectId, {
                params: { ...getReverbParamsForTrack(context, track.id, resolved.effectId), decay },
              });
            },
            undefined,
            'Effect parameter',
          ),
        );
      }
    }
  }

  return commands;
}

function parseTempoCommand(query: string, context: CommandPaletteContext): CommandPaletteCommand[] {
  const normalized = normalize(query);
  const match = normalized.match(/\b(?:tempo|bpm)(?:\s+to)?\s+(\d{2,3})\b/);
  if (!match) return [];

  const bpm = Number(match[1]);
  const command = buildTempoCommand(context, bpm);
  return command ? [command] : [];
}

export function buildCommandPaletteCommands(context: CommandPaletteContext): CommandPaletteCommand[] {
  const commands: CommandPaletteCommand[] = [];

  commands.push(
    createTrackCommand(
      'transport:play-pause',
      context.isPlaying ? 'Pause Playback' : 'Play Playback',
      'Transport',
      'action',
      ['transport', 'play', 'pause', 'spacebar'],
      ['start playback', 'pause transport', 'toggle transport'],
      () => {
        if (context.isPlaying) {
          void context.actions.pause();
        } else {
          void context.actions.play();
        }
      },
      ['Space'],
      'Transport control',
    ),
    createTrackCommand(
      'transport:stop',
      'Stop Playback',
      'Transport',
      'action',
      ['transport', 'stop', 'rewind'],
      ['stop transport', 'go to start', 'rewind to start'],
      () => {
        void context.actions.stop();
      },
      ['Enter'],
      'Transport control',
    ),
    createTrackCommand(
      'transport:toggle-loop',
      context.loopEnabled ? 'Disable Loop' : 'Enable Loop',
      'Transport',
      'action',
      ['transport', 'loop', 'cycle'],
      ['toggle loop', 'toggle cycle', 'cycle playback'],
      context.actions.toggleLoop,
      ['L'],
      'Transport control',
    ),
    createTrackCommand(
      'transport:toggle-metronome',
      context.metronomeEnabled ? 'Disable Metronome' : 'Enable Metronome',
      'Transport',
      'action',
      ['transport', 'metronome', 'click'],
      ['toggle metronome', 'click track', 'count in click'],
      context.actions.toggleMetronome,
      ['K'],
      'Transport control',
    ),
  );

  commands.push(
    createTrackCommand(
      'project:new',
      'New Project',
      'Project',
      'action',
      ['project', 'new', 'create'],
      ['create project', 'start new song'],
      () => context.actions.setShowNewProjectDialog(true),
      ['Cmd', 'N'],
      'Project dialog',
    ),
    createTrackCommand(
      'project:open',
      'Open Project List',
      'Project',
      'action',
      ['project', 'open', 'recent'],
      ['show projects', 'project browser', 'open recent project'],
      () => context.actions.setShowProjectListDialog(true),
      ['Cmd', 'O'],
      'Project dialog',
    ),
    createTrackCommand(
      'project:settings',
      'Open Generate Settings',
      'Project',
      'setting',
      ['settings', 'preferences', 'project', 'model', 'backend', 'generate'],
      ['preferences', 'project settings', 'generate settings', 'model settings'],
      () => context.actions.openGenerationSettings(),
      ['Cmd', ','],
      'Generate panel',
    ),
    createTrackCommand(
      'project:export',
      'Open Export Dialog',
      'Project',
      'action',
      ['export', 'bounce', 'render'],
      ['export project', 'render mix', 'bounce song'],
      () => context.actions.setShowExportDialog(true),
      ['Cmd', 'Shift', 'E'],
      'Project dialog',
    ),
    createTrackCommand(
      'project:shortcuts',
      'Show Keyboard Shortcuts',
      'Project',
      'action',
      ['shortcuts', 'help', 'keyboard'],
      ['shortcut help', 'show hotkeys', 'help overlay'],
      () => context.actions.setShowKeyboardShortcutsDialog(true),
      ['?'],
      'Help dialog',
    ),
    createTrackCommand(
      'view:zoom-to-selection',
      'Zoom to Selection',
      'View',
      'action',
      ['zoom', 'selection', 'timeline', 'arrangement'],
      ['zoom to selected clips', 'zoom to region', 'fit selection'],
      context.actions.zoomTimelineToSelection,
      ['Z'],
      'Arrangement zoom',
    ),
    createTrackCommand(
      'view:zoom-to-fit-project',
      'Fit Full Project',
      'View',
      'action',
      ['zoom', 'fit', 'project', 'timeline', 'arrangement'],
      ['zoom to fit', 'fit project', 'show full song'],
      context.actions.zoomTimelineToProject,
      ['Shift', 'Z'],
      'Arrangement zoom',
    ),
  );

  commands.push(
    createTrackCommand(
      'panel:library',
      context.showLibrary ? 'Hide Library' : 'Show Library',
      'Panels',
      'action',
      ['panel', 'library', 'browser'],
      ['toggle library', 'open library'],
      () => context.actions.setShowLibrary(!context.showLibrary),
      ['Y'],
      'Panel toggle',
    ),
    createTrackCommand(
      'panel:mixer',
      context.showMixer ? 'Hide Mixer' : 'Show Mixer',
      'Panels',
      'action',
      ['panel', 'mixer', 'volume'],
      ['toggle mixer', 'open mixer', 'show levels'],
      () => context.actions.setShowMixer(!context.showMixer),
      ['X'],
      'Panel toggle',
    ),
    createTrackCommand(
      'panel:smart-controls',
      context.showSmartControls ? 'Hide Smart Controls' : 'Show Smart Controls',
      'Panels',
      'action',
      ['panel', 'smart controls', 'controls'],
      ['toggle smart controls', 'open smart controls'],
      () => context.actions.setShowSmartControls(!context.showSmartControls),
      ['B'],
      'Panel toggle',
    ),
    createTrackCommand(
      'panel:loop-browser',
      context.loopBrowserOpen ? 'Hide Loop Browser' : 'Show Loop Browser',
      'Panels',
      'action',
      ['panel', 'loop browser', 'loops', 'samples'],
      ['toggle loop browser', 'open loops', 'show sample browser'],
      context.actions.toggleLoopBrowser,
      ['O'],
      'Panel toggle',
    ),
    createTrackCommand(
      'panel:tempo-lane',
      context.showTempoLane ? 'Hide Tempo Lane' : 'Show Tempo Lane',
      'Panels',
      'action',
      ['panel', 'tempo lane', 'tempo', 'automation'],
      ['toggle tempo lane', 'open tempo lane'],
      context.actions.toggleTempoLane,
      ['T'],
      'Panel toggle',
    ),
    createTrackCommand(
      'panel:ai-assistant',
      context.showAIAssistant ? 'Hide AI Assistant' : 'Show AI Assistant',
      'Panels',
      'action',
      ['panel', 'assistant', 'ai', 'help'],
      ['toggle ai assistant', 'open ai assistant', 'assistant help'],
      context.actions.toggleAIAssistant,
      ['Cmd', '/'],
      'Panel toggle',
    ),
  );

  commands.push(
    createTrackCommand(
      'generation:silence',
      'Generate from Silence',
      'Generation',
      'action',
      ['generate', 'ai', 'silence', 'clip'],
      ['generate clip', 'ai generate', 'create clip from silence'],
      () => context.actions.setBatchGenerateMode('silence'),
      ['Cmd', 'G'],
      'AI generation',
    ),
    createTrackCommand(
      'generation:context',
      'Generate from Context',
      'Generation',
      'action',
      ['generate', 'ai', 'context', 'clip'],
      ['generate from context', 'continue idea', 'ai continue region'],
      () => context.actions.setBatchGenerateMode('context'),
      ['Cmd', 'Shift', 'G'],
      'AI generation',
    ),
  );

  commands.push(
    createTrackCommand(
      'track:add-drums',
      'Add Drums Track',
      'Tracks',
      'action',
      ['track', 'add', 'drums', 'beat'],
      ['new drums track', 'add drum track', 'create drum track'],
      () => {
        context.actions.addTrack('drums');
      },
      undefined,
      'Track action',
    ),
    createTrackCommand(
      'track:add-bass',
      'Add Bass Track',
      'Tracks',
      'action',
      ['track', 'add', 'bass'],
      ['new bass track', 'create bass track'],
      () => {
        context.actions.addTrack('bass');
      },
      undefined,
      'Track action',
    ),
    createTrackCommand(
      'track:add-piano',
      'Add Piano Track',
      'Tracks',
      'action',
      ['track', 'add', 'piano', 'keys', 'midi'],
      ['new piano track', 'create piano track', 'add keyboard track'],
      () => {
        context.actions.addTrack('keyboard', 'pianoRoll');
      },
      undefined,
      'Track action',
    ),
    createTrackCommand(
      'track:add-sampler',
      'Add Sampler Track',
      'Tracks',
      'action',
      ['track', 'add', 'sampler', 'instrument'],
      ['new sampler track', 'create sampler track'],
      () => {
        context.actions.addTrack('keyboard', 'pianoRoll');
      },
      undefined,
      'Track action',
    ),
    createTrackCommand(
      'track:add-drum-machine',
      'Add Drum Machine Track',
      'Tracks',
      'action',
      ['track', 'add', 'drum machine', 'sequencer'],
      ['new drum machine', 'create drum machine track'],
      () => {
        context.actions.addTrack('drums', 'drumMachine');
      },
      undefined,
      'Track action',
    ),
  );

  const selectedClipId = context.selectedClipIds[0];
  if (selectedClipId) {
    commands.push(
      createTrackCommand(
        'clip:duplicate-selected',
        'Duplicate Selected Clip',
        'Clips',
        'action',
        ['clip', 'duplicate', 'selected'],
        ['copy selected clip', 'duplicate current clip'],
        () => context.actions.duplicateClip(selectedClipId),
        ['Cmd', 'D'],
        'Selected clip action',
      ),
      createTrackCommand(
        'clip:split-selected',
        'Split Selected Clip at Playhead',
        'Clips',
        'action',
        ['clip', 'split', 'selected', 'playhead'],
        ['cut selected clip', 'split current clip'],
        () => context.actions.splitClipAtZeroCrossing(selectedClipId, context.currentTime),
        ['S'],
        'Selected clip action',
      ),
      createTrackCommand(
        'clip:edit-selected',
        'Edit Selected Clip',
        'Clips',
        'action',
        ['clip', 'edit', 'selected', 'piano roll'],
        ['open clip editor', 'edit current clip'],
        () => context.actions.setEditingClip(selectedClipId),
        ['E'],
        'Selected clip action',
      ),
    );
  }

  if (context.selectedClipIds.length > 0) {
    commands.push(
      createTrackCommand(
        'clip:delete-selected',
        'Delete Selected Clips',
        'Clips',
        'action',
        ['clip', 'delete', 'remove', 'selected'],
        ['remove selected clips', 'delete current clips'],
        () => {
          const ids = [...context.selectedClipIds];
          context.actions.deselectAll();
          ids.forEach((clipId) => context.actions.removeClip(clipId));
        },
        ['Delete'],
        'Selected clip action',
      ),
    );
  }

  const selectedTrack = getTrackForSelection(context);
  const tracks = context.project?.tracks ?? [];
  for (const track of tracks) {
    const trackName = track.displayName.toLowerCase();
    const selectedKeywords = selectedTrack?.id === track.id ? ['selected track', 'focused track'] : [];
    const effectDefs: { type: TrackEffectType; label: string; aliases: string[] }[] = [
      {
        type: 'reverb',
        label: 'Reverb',
        aliases: [`add reverb to ${trackName}`, `${trackName} reverb`, `put reverb on ${trackName}`],
      },
      {
        type: 'delay',
        label: 'Delay',
        aliases: [`add delay to ${trackName}`, `${trackName} delay`, `echo ${trackName}`],
      },
      {
        type: 'compressor',
        label: 'Compressor',
        aliases: [`add compressor to ${trackName}`, `compress ${trackName}`, `${trackName} compression`],
      },
      {
        type: 'parametricEq',
        label: 'Parametric EQ',
        aliases: [`add eq to ${trackName}`, `${trackName} eq`, `equalize ${trackName}`],
      },
    ];

    for (const effect of effectDefs) {
      commands.push(
        createTrackCommand(
          `track:${track.id}:effect:${effect.type}`,
          `Add ${effect.label} to ${track.displayName}`,
          'Effects',
          'action',
          ['effect', effect.label.toLowerCase(), track.displayName, trackName, 'track', ...selectedKeywords],
          effect.aliases,
          () => {
            context.actions.addTrackEffect(track.id, effect.type);
          },
          undefined,
          `Track effect on ${track.displayName}`,
        ),
      );
    }

    commands.push(
      createTrackParameterCommand(
        `track:${track.id}:mute-toggle`,
        `${track.muted ? 'Unmute' : 'Mute'} ${track.displayName}`,
        ['track', track.displayName, 'mute', 'volume', 'parameter'],
        [`mute ${trackName}`, `toggle mute ${trackName}`, `${trackName} mute`],
        () => context.actions.updateTrack(track.id, { muted: !track.muted }),
        ['M'],
        'Track parameter',
      ),
      createTrackParameterCommand(
        `track:${track.id}:solo-toggle`,
        `${track.soloed ? 'Unsolo' : 'Solo'} ${track.displayName}`,
        ['track', track.displayName, 'solo', 'audition', 'parameter'],
        [`solo ${trackName}`, `toggle solo ${trackName}`, `${trackName} solo`],
        () => context.actions.updateTrack(track.id, { soloed: !track.soloed }),
        ['S'],
        'Track parameter',
      ),
    );

    for (const volumePercent of [25, 50, 80, 100]) {
      commands.push(
        createTrackParameterCommand(
          `track:${track.id}:volume:${volumePercent}`,
          `Set ${track.displayName} Volume to ${volumePercent}%`,
          ['track', track.displayName, 'volume', `${volumePercent}%`, 'gain', 'level'],
          [
            `${trackName} volume ${volumePercent}`,
            `set ${trackName} volume to ${volumePercent}`,
            `${trackName} gain ${volumePercent}`,
          ],
          () => context.actions.updateTrack(track.id, { volume: volumePercent / 100 }),
          undefined,
          'Track parameter',
        ),
      );
    }

    for (const panValue of [-1, 0, 1]) {
      const label = formatPanLabel(panValue);
      commands.push(
        createTrackParameterCommand(
          `track:${track.id}:pan:${Math.round(panValue * 100)}`,
          `Pan ${track.displayName} ${label}`,
          ['track', track.displayName, 'pan', label.toLowerCase(), 'stereo'],
          [
            `${trackName} pan ${formatPanAlias(panValue)}`,
            `pan ${trackName} ${formatPanAlias(panValue)}`,
          ],
          () => context.actions.updateTrackMixer(track.id, { pan: panValue }),
          undefined,
          'Track parameter',
        ),
      );
    }

    const reverbPresets = [
      { label: 'Short', decay: 1.2 },
      { label: 'Medium', decay: 2.4 },
      { label: 'Long', decay: 4.8 },
    ];
    for (const preset of reverbPresets) {
      commands.push(
        createTrackParameterCommand(
          `track:${track.id}:reverb-decay:${preset.decay}`,
          `Set ${track.displayName} Reverb Decay to ${preset.label}`,
          ['track', track.displayName, 'reverb', 'decay', preset.label.toLowerCase()],
          [
            `${trackName} reverb decay`,
            `${trackName} ${preset.label.toLowerCase()} reverb`,
            `reverb decay ${trackName}`,
          ],
          () => {
            const resolved = ensureTrackEffect(context, track.id, 'reverb');
            if (!resolved) return;
            context.actions.updateTrackEffect(track.id, resolved.effectId, {
              params: { ...getReverbParamsForTrack(context, track.id, resolved.effectId), decay: preset.decay },
            });
          },
          undefined,
          'Effect parameter',
        ),
      );
    }
  }

  return commands;
}

export function buildCommandPaletteRegistry(
  context: CommandPaletteContext,
  query = '',
): CommandPaletteRegistryEntry[] {
  const commands = buildCommandPaletteCommands(context);
  const extraCommands = [...parseTempoCommand(query, context), ...buildDynamicTrackParameterCommands(query, context)];
  const seen = new Set<string>();
  return [...commands, ...extraCommands].filter((command) => {
    if (seen.has(command.id)) return false;
    seen.add(command.id);
    return true;
  }).map(({ execute: _execute, ...entry }) => entry);
}

export function searchCommandPaletteCommands(
  query: string,
  commands: CommandPaletteCommand[],
  recentCommandIds: string[],
  extraCommands: CommandPaletteCommand[] = [],
  limit = DEFAULT_RESULT_LIMIT,
): CommandPaletteSearchResult[] {
  const normalizedQuery = normalize(query);
  const queryTokens = tokenize(query);
  const recencyOrder = new Map(recentCommandIds.map((id, index) => [id, index]));
  const seen = new Set<string>();
  const allCommands = [...extraCommands, ...commands].filter((command) => {
    if (seen.has(command.id)) return false;
    seen.add(command.id);
    return true;
  });

  const scored = allCommands
    .map((command) => {
      const corpus = buildSearchCorpus(command);
      const aliasCorpus = normalize(command.aliases.join(' '));
      const title = normalize(command.title);
      const isRecent = recencyOrder.has(command.id);
      let score = isRecent ? 40 - (recencyOrder.get(command.id) ?? 0) : 0;

      if (!normalizedQuery) {
        score += command.section === 'Transport' ? 4 : 0;
      } else {
        if (title === normalizedQuery || command.aliases.some((alias) => normalize(alias) === normalizedQuery)) {
          score += 120;
        } else if (title.startsWith(normalizedQuery)) {
          score += 95;
        } else if (title.includes(normalizedQuery)) {
          score += 80;
        }

        if (aliasCorpus.includes(normalizedQuery)) {
          score += 70;
        }

        let matchedTokens = 0;
        for (const token of queryTokens) {
          if (corpus.includes(token)) {
            matchedTokens += 1;
            score += 12;
          }
        }

        if (queryTokens.length > 0 && matchedTokens === queryTokens.length) {
          score += 40;
        } else if (matchedTokens === 0) {
          score = 0;
        }
      }

      return { ...command, score, isRecent };
    })
    .filter((command) => command.score > 0 || !normalizedQuery)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;

      const aRecency = recencyOrder.get(a.id);
      const bRecency = recencyOrder.get(b.id);
      if (aRecency !== undefined && bRecency !== undefined && aRecency !== bRecency) {
        return aRecency - bRecency;
      }
      if (aRecency !== undefined) return -1;
      if (bRecency !== undefined) return 1;

      return a.title.localeCompare(b.title);
    });

  return scored.slice(0, limit);
}

export function searchCommandsForQuery(
  query: string,
  context: CommandPaletteContext,
  recentCommandIds: string[],
  limit = DEFAULT_RESULT_LIMIT,
): CommandPaletteSearchResult[] {
  const commands = buildCommandPaletteCommands(context);
  const extraCommands = [...parseTempoCommand(query, context), ...buildDynamicTrackParameterCommands(query, context)];
  return searchCommandPaletteCommands(query, commands, recentCommandIds, extraCommands, limit);
}
