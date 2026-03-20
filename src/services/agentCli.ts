import type { PianoRollTool } from '../components/pianoroll/PianoRollConstants';
import { projectActionApi } from './actionApi';
import { useProjectStore } from '../store/projectStore';
import { useTransportStore } from '../store/transportStore';
import { useUIStore } from '../store/uiStore';
import { usePostProductionStore } from '../store/postProductionStore';
import type { Track } from '../types/project';
import {
  getPostProductionTaskState,
  openPostProduction,
  runNextPostProductionStep,
  startExtendTask,
  startPolishTask,
  startRepairTask,
} from './postProductionOrchestrator';
import type {
  AgentCliBatchRequest,
  AgentCliBatchResult,
  AgentCliCommandDescriptor,
  AgentCliCommandResult,
  AgentCliError,
  AgentCliErrorCode,
  AgentCliGlobal,
  ClipCreateMidiCommandArgs,
  ClipCoverOpenCommandArgs,
  ClipSelectCommandArgs,
  PanelToggleCommandArgs,
  PianoRollNoteAddCommandArgs,
  PianoRollNoteResizeCommandArgs,
  PianoRollOpenCommandArgs,
  PianoRollToolSetCommandArgs,
  ProjectCreateCommandArgs,
  ProjectOpenCommandArgs,
  SequencerOpenCommandArgs,
  SequencerPatternInspectCommandArgs,
  SequencerStepToggleCommandArgs,
  PostProductionOpenCommandArgs,
  PostProductionStartExtendCommandArgs,
  PostProductionStartPolishCommandArgs,
  PostProductionStartRepairCommandArgs,
  TrackAddCommandArgs,
  TrackSelectCommandArgs,
} from '../types/agentCli';

const PANEL_VALUES = new Set<PanelToggleCommandArgs['panel']>([
  'mixer',
  'library',
  'smartControls',
  'generation',
  'commandPalette',
  'loopBrowser',
  'tempoLane',
  'aiAssistant',
]);

const PIANO_ROLL_TOOLS = new Set<PianoRollTool>(['select', 'pencil', 'paint', 'erase', 'slide']);

function descriptor(input: AgentCliCommandDescriptor): AgentCliCommandDescriptor {
  return input;
}

const COMMAND_DESCRIPTORS: AgentCliCommandDescriptor[] = [
  descriptor({
    id: 'project.create',
    title: 'Create Project',
    category: 'project',
    description: 'Create a new empty project with optional tempo and naming metadata.',
    argsSchema: {
      name: { type: 'string', description: 'Project name.' },
      bpm: { type: 'number', description: 'Project BPM.' },
      keyScale: { type: 'string', description: 'Project key/scale label.' },
      timeSignature: { type: 'number', description: 'Beats per bar.' },
    },
    requiresProject: false,
    undoable: false,
  }),
  descriptor({
    id: 'project.open',
    title: 'Open Project Snapshot',
    category: 'project',
    description: 'Replace the active project with a provided project payload.',
    argsSchema: {
      project: { type: 'object', required: true, description: 'Serialized Project object.' },
    },
    requiresProject: false,
    undoable: false,
  }),
  descriptor({
    id: 'project.summary',
    title: 'Summarize Project',
    category: 'project',
    description: 'Return a compact project summary for agent workflows.',
    argsSchema: {},
    requiresProject: false,
    undoable: false,
  }),
  descriptor({
    id: 'transport.play',
    title: 'Play',
    category: 'transport',
    description: 'Start transport playback.',
    argsSchema: {},
    requiresProject: true,
    undoable: false,
  }),
  descriptor({
    id: 'transport.pause',
    title: 'Pause',
    category: 'transport',
    description: 'Pause transport playback.',
    argsSchema: {},
    requiresProject: true,
    undoable: false,
  }),
  descriptor({
    id: 'transport.stop',
    title: 'Stop',
    category: 'transport',
    description: 'Stop transport playback and rewind to start.',
    argsSchema: {},
    requiresProject: true,
    undoable: false,
  }),
  descriptor({
    id: 'transport.record.toggle',
    title: 'Toggle Record',
    category: 'transport',
    description: 'Toggle recording state.',
    argsSchema: {},
    requiresProject: true,
    undoable: false,
  }),
  descriptor({
    id: 'transport.loop.toggle',
    title: 'Toggle Loop',
    category: 'transport',
    description: 'Toggle loop mode.',
    argsSchema: {},
    requiresProject: true,
    undoable: false,
  }),
  descriptor({
    id: 'transport.metronome.toggle',
    title: 'Toggle Metronome',
    category: 'transport',
    description: 'Toggle the metronome state.',
    argsSchema: {},
    requiresProject: true,
    undoable: false,
  }),
  descriptor({
    id: 'track.add',
    title: 'Add Track',
    category: 'track',
    description: 'Add a track with the requested track name and optional track type.',
    argsSchema: {
      trackName: { type: 'string', required: true, description: 'TrackName value.' },
      trackType: { type: 'string', description: 'Optional TrackType override.' },
    },
    requiresProject: true,
    undoable: true,
  }),
  descriptor({
    id: 'track.add.drums',
    title: 'Add Drums Track',
    category: 'track',
    description: 'Convenience alias for adding a drums track.',
    argsSchema: {},
    requiresProject: true,
    undoable: true,
  }),
  descriptor({
    id: 'track.add.bass',
    title: 'Add Bass Track',
    category: 'track',
    description: 'Convenience alias for adding a bass track.',
    argsSchema: {},
    requiresProject: true,
    undoable: true,
  }),
  descriptor({
    id: 'track.add.piano',
    title: 'Add Piano Track',
    category: 'track',
    description: 'Convenience alias for adding a piano-roll keyboard track.',
    argsSchema: {},
    requiresProject: true,
    undoable: true,
  }),
  descriptor({
    id: 'track.add.sampler',
    title: 'Add Sampler Track',
    category: 'track',
    description: 'Convenience alias for adding a piano-roll sampler track.',
    argsSchema: {},
    requiresProject: true,
    undoable: true,
  }),
  descriptor({
    id: 'track.add.drumMachine',
    title: 'Add Drum Machine Track',
    category: 'track',
    description: 'Convenience alias for adding a drum machine track.',
    argsSchema: {},
    requiresProject: true,
    undoable: true,
  }),
  descriptor({
    id: 'track.select',
    title: 'Select Track',
    category: 'track',
    description: 'Select one track in the UI selection model.',
    argsSchema: {
      trackId: { type: 'string', required: true, description: 'Target track id.' },
      multi: { type: 'boolean', description: 'Multi-select toggle mode.' },
    },
    requiresProject: true,
    undoable: false,
  }),
  descriptor({
    id: 'track.list',
    title: 'List Tracks',
    category: 'track',
    description: 'List track ids, names, and editor metadata.',
    argsSchema: {},
    requiresProject: true,
    undoable: false,
  }),
  descriptor({
    id: 'clip.createMidi',
    title: 'Create MIDI Clip',
    category: 'clip',
    description: 'Ensure a MIDI clip exists on the target track.',
    argsSchema: {
      trackId: { type: 'string', required: true, description: 'Track id.' },
      startTime: { type: 'number', description: 'Clip start time in seconds.' },
      duration: { type: 'number', description: 'Clip duration in seconds.' },
    },
    requiresProject: true,
    undoable: true,
  }),
  descriptor({
    id: 'clip.cover.open',
    title: 'Open Cover For Clip',
    category: 'clip',
    description: 'Open the cover workflow for one audio clip.',
    argsSchema: {
      clipId: { type: 'string', required: true, description: 'Target audio clip id.' },
    },
    requiresProject: true,
    undoable: false,
  }),
  descriptor({
    id: 'clip.select',
    title: 'Select Clip',
    category: 'clip',
    description: 'Select one clip in the UI selection model.',
    argsSchema: {
      clipId: { type: 'string', required: true, description: 'Target clip id.' },
      multi: { type: 'boolean', description: 'Multi-select toggle mode.' },
    },
    requiresProject: true,
    undoable: false,
  }),
  descriptor({
    id: 'clip.list',
    title: 'List Clips',
    category: 'clip',
    description: 'List clips across the project or within a target track.',
    argsSchema: {
      trackId: { type: 'string', description: 'Optional track id filter.' },
    },
    requiresProject: true,
    undoable: false,
  }),
  descriptor({
    id: 'pianoroll.open',
    title: 'Open Piano Roll',
    category: 'pianoRoll',
    description: 'Open the piano roll editor for a track and optional clip.',
    argsSchema: {
      trackId: { type: 'string', required: true, description: 'Track id.' },
      clipId: { type: 'string', description: 'Optional MIDI clip id.' },
    },
    requiresProject: true,
    undoable: false,
  }),
  descriptor({
    id: 'pianoroll.note.add',
    title: 'Add MIDI Note',
    category: 'pianoRoll',
    description: 'Add one MIDI note to a clip.',
    argsSchema: {
      clipId: { type: 'string', required: true, description: 'MIDI clip id.' },
      pitch: { type: 'number', required: true, description: 'MIDI note number.' },
      startBeat: { type: 'number', required: true, description: 'Start beat.' },
      durationBeats: { type: 'number', required: true, description: 'Duration in beats.' },
      velocity: { type: 'number', required: true, description: 'Velocity 0..1.' },
    },
    requiresProject: true,
    undoable: true,
  }),
  descriptor({
    id: 'pianoroll.note.resize',
    title: 'Resize MIDI Note',
    category: 'pianoRoll',
    description: 'Resize one MIDI note from the left or right edge.',
    argsSchema: {
      clipId: { type: 'string', required: true, description: 'MIDI clip id.' },
      noteId: { type: 'string', required: true, description: 'MIDI note id.' },
      edge: { type: 'string', required: true, description: 'Resize edge: left or right.' },
      startBeat: { type: 'number', description: 'New start beat when resizing from left.' },
      endBeat: { type: 'number', description: 'New end beat when resizing from right.' },
      minDurationBeats: { type: 'number', description: 'Minimum allowed duration.' },
    },
    requiresProject: true,
    undoable: true,
  }),
  descriptor({
    id: 'pianoroll.tool.set',
    title: 'Set Piano Roll Tool',
    category: 'pianoRoll',
    description: 'Switch the active piano roll tool.',
    argsSchema: {
      tool: { type: 'string', required: true, description: 'Tool: select, pencil, paint, erase, slide.' },
    },
    requiresProject: true,
    undoable: false,
  }),
  descriptor({
    id: 'sequencer.open',
    title: 'Open Sequencer',
    category: 'sequencer',
    description: 'Open the sequencer or drum machine editor for a track.',
    argsSchema: {
      trackId: { type: 'string', required: true, description: 'Sequencer or drum machine track id.' },
    },
    requiresProject: true,
    undoable: false,
  }),
  descriptor({
    id: 'sequencer.step.toggle',
    title: 'Toggle Sequencer Step',
    category: 'sequencer',
    description: 'Toggle one step in a sequencer row.',
    argsSchema: {
      trackId: { type: 'string', required: true, description: 'Sequencer track id.' },
      rowId: { type: 'string', required: true, description: 'Sequencer row id.' },
      stepIndex: { type: 'number', required: true, description: '0-based step index.' },
    },
    requiresProject: true,
    undoable: true,
  }),
  descriptor({
    id: 'sequencer.pattern.inspect',
    title: 'Inspect Sequencer Pattern',
    category: 'sequencer',
    description: 'Return the current sequencer pattern structure for a track.',
    argsSchema: {
      trackId: { type: 'string', required: true, description: 'Sequencer track id.' },
    },
    requiresProject: true,
    undoable: false,
  }),
  descriptor({
    id: 'postProduction.open',
    title: 'Open Post-Production Copilot',
    category: 'postProduction',
    description: 'Open the unified post-production copilot surface for Repair, Extend, or Polish.',
    argsSchema: {
      taskType: { type: 'string', description: 'Optional task type: repair, extend, or polish.' },
    },
    requiresProject: true,
    undoable: false,
  }),
  descriptor({
    id: 'postProduction.startRepair',
    title: 'Start Repair Task',
    category: 'postProduction',
    description: 'Configure and run the Repair task against a clip/time range.',
    argsSchema: {
      clipId: { type: 'string', description: 'Optional clip id override.' },
      startTime: { type: 'number', description: 'Optional repair start time in seconds.' },
      endTime: { type: 'number', description: 'Optional repair end time in seconds.' },
      prompt: { type: 'string', description: 'Repair prompt override.' },
      lyrics: { type: 'string', description: 'Optional lyric override.' },
      globalCaption: { type: 'string', description: 'Optional song-level caption override.' },
    },
    requiresProject: true,
    undoable: true,
  }),
  descriptor({
    id: 'postProduction.startExtend',
    title: 'Start Extend Task',
    category: 'postProduction',
    description: 'Configure and run the Extend task using the current selection/context.',
    argsSchema: {
      trackIds: { type: 'array', description: 'Optional target track ids.' },
      startTime: { type: 'number', description: 'Optional selection start time in seconds.' },
      endTime: { type: 'number', description: 'Optional selection end time in seconds.' },
      prompt: { type: 'string', description: 'Extend prompt override.' },
      lyrics: { type: 'string', description: 'Optional lyric override.' },
      globalCaption: { type: 'string', description: 'Optional song-level caption override.' },
      contextMode: { type: 'string', description: 'Context mode: auto, context, selection, none.' },
    },
    requiresProject: true,
    undoable: true,
  }),
  descriptor({
    id: 'postProduction.startPolish',
    title: 'Start Polish Task',
    category: 'postProduction',
    description: 'Analyze the mix and apply AI mastering settings.',
    argsSchema: {
      preset: { type: 'string', description: 'Optional mastering preset override.' },
      loudnessTarget: { type: 'number', description: 'Optional loudness target in LUFS.' },
    },
    requiresProject: true,
    undoable: true,
  }),
  descriptor({
    id: 'postProduction.getTaskState',
    title: 'Get Post-Production Task State',
    category: 'postProduction',
    description: 'Read the current post-production task state and latest result/error.',
    argsSchema: {},
    requiresProject: true,
    undoable: false,
  }),
  descriptor({
    id: 'postProduction.runNextStep',
    title: 'Open Next Post-Production Step',
    category: 'postProduction',
    description: 'Advance from Repair to Extend or Extend to Polish after a completed task.',
    argsSchema: {},
    requiresProject: true,
    undoable: false,
  }),
  descriptor({
    id: 'panel.toggle',
    title: 'Toggle Panel',
    category: 'panel',
    description: 'Toggle one major app panel.',
    argsSchema: {
      panel: { type: 'string', required: true, description: 'Panel id.' },
    },
    requiresProject: true,
    undoable: false,
  }),
  descriptor({
    id: 'panel.toggle.library',
    title: 'Toggle Library',
    category: 'panel',
    description: 'Convenience alias for toggling the Library panel.',
    argsSchema: {},
    requiresProject: true,
    undoable: false,
  }),
  descriptor({
    id: 'panel.toggle.mixer',
    title: 'Toggle Mixer',
    category: 'panel',
    description: 'Convenience alias for toggling the Mixer panel.',
    argsSchema: {},
    requiresProject: true,
    undoable: false,
  }),
  descriptor({
    id: 'panel.toggle.smartControls',
    title: 'Toggle Smart Controls',
    category: 'panel',
    description: 'Convenience alias for toggling Smart Controls.',
    argsSchema: {},
    requiresProject: true,
    undoable: false,
  }),
  descriptor({
    id: 'panel.toggle.generation',
    title: 'Toggle Generation Panel',
    category: 'panel',
    description: 'Convenience alias for toggling the Generation panel.',
    argsSchema: {},
    requiresProject: true,
    undoable: false,
  }),
  descriptor({
    id: 'panel.toggle.commandPalette',
    title: 'Toggle Command Palette',
    category: 'panel',
    description: 'Convenience alias for toggling the Command Palette.',
    argsSchema: {},
    requiresProject: true,
    undoable: false,
  }),
  descriptor({
    id: 'panel.toggle.loopBrowser',
    title: 'Toggle Loop Browser',
    category: 'panel',
    description: 'Convenience alias for toggling the Loop Browser.',
    argsSchema: {},
    requiresProject: true,
    undoable: false,
  }),
  descriptor({
    id: 'panel.toggle.tempoLane',
    title: 'Toggle Tempo Lane',
    category: 'panel',
    description: 'Convenience alias for toggling the Tempo lane.',
    argsSchema: {},
    requiresProject: true,
    undoable: false,
  }),
  descriptor({
    id: 'panel.toggle.aiAssistant',
    title: 'Toggle AI Assistant',
    category: 'panel',
    description: 'Convenience alias for toggling the AI assistant panel.',
    argsSchema: {},
    requiresProject: true,
    undoable: false,
  }),
];

const COMMAND_DESCRIPTOR_MAP = new Map(COMMAND_DESCRIPTORS.map((item) => [item.id, item]));

function buildError(
  code: AgentCliErrorCode,
  message: string,
  context: Record<string, unknown>,
  recoverySuggestions: AgentCliError['recoverySuggestions'] = [],
): AgentCliError {
  return { code, message, context, recoverySuggestions };
}

function ok(commandId: string, value: unknown): AgentCliCommandResult {
  return { ok: true, commandId, timestamp: Date.now(), value };
}

function fail(commandId: string, error: AgentCliError): AgentCliCommandResult {
  return { ok: false, commandId, timestamp: Date.now(), error };
}

function validateArgs(commandId: string, args: Record<string, unknown> | undefined): AgentCliError | null {
  const command = COMMAND_DESCRIPTOR_MAP.get(commandId);
  if (!command) {
    return buildError('COMMAND_NOT_FOUND', `Unknown command '${commandId}'.`, { commandId });
  }

  const payload = args ?? {};
  for (const [key, schema] of Object.entries(command.argsSchema)) {
    const value = payload[key];
    if (schema.required && typeof value === 'undefined') {
      return buildError('INVALID_ARGUMENTS', `Missing required argument '${key}'.`, { commandId, args: payload });
    }
    if (typeof value === 'undefined') continue;
    if (schema.type === 'array') {
      if (!Array.isArray(value)) {
        return buildError('INVALID_ARGUMENTS', `Argument '${key}' must be an array.`, { commandId, args: payload });
      }
      continue;
    }
    if (schema.type === 'object') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return buildError('INVALID_ARGUMENTS', `Argument '${key}' must be an object.`, { commandId, args: payload });
      }
      continue;
    }
    if (typeof value !== schema.type) {
      return buildError('INVALID_ARGUMENTS', `Argument '${key}' must be a ${schema.type}.`, { commandId, args: payload });
    }
  }

  return null;
}

function getProjectRequiredError(commandId: string): AgentCliError {
  return buildError(
    'PROJECT_REQUIRED',
    'Create or open a project before running this command.',
    { commandId },
    [
      { action: 'project.create', label: 'Create a new project' },
      { action: 'project.open', label: 'Open a serialized project snapshot' },
    ],
  );
}

function getTrack(trackId: string): Track | undefined {
  return useProjectStore.getState().project?.tracks.find((track) => track.id === trackId);
}

function getClip(clipId: string) {
  return useProjectStore.getState().project?.tracks.flatMap((track) => track.clips).find((clip) => clip.id === clipId);
}

function mapActionFailure(commandId: string, result: {
  code: string;
  message: string;
  context: Record<string, unknown>;
  suggestions: Array<{ action: string; label: string; params?: Record<string, unknown> }>;
}) {
  return fail(commandId, buildError(
    result.code as AgentCliErrorCode,
    result.message,
    result.context,
    result.suggestions.map((item) => ({
      action: item.action,
      label: item.label,
      params: item.params,
    })),
  ));
}

async function executeCommand(commandId: string, args: Record<string, unknown> | undefined): Promise<AgentCliCommandResult> {
  const command = COMMAND_DESCRIPTOR_MAP.get(commandId);
  if (!command) {
    return fail(commandId, buildError('COMMAND_NOT_FOUND', `Unknown command '${commandId}'.`, { commandId }));
  }

  const validationError = validateArgs(commandId, args);
  if (validationError) {
    return fail(commandId, validationError);
  }

  if (command.requiresProject && !useProjectStore.getState().project) {
    return fail(commandId, getProjectRequiredError(commandId));
  }

  const payload = (args ?? {}) as Record<string, unknown>;

  try {
    switch (commandId) {
      case 'project.create': {
        useProjectStore.getState().createProject(payload as ProjectCreateCommandArgs);
        return ok(commandId, useProjectStore.getState().project);
      }
      case 'project.open': {
        const input = payload as unknown as ProjectOpenCommandArgs;
        if (!input.project || typeof input.project !== 'object') {
          return fail(commandId, buildError('INVALID_PROJECT_PAYLOAD', 'Expected a Project payload.', { commandId, args: payload }));
        }
        useProjectStore.getState().setProject(input.project);
        return ok(commandId, useProjectStore.getState().project);
      }
      case 'project.summary': {
        const project = useProjectStore.getState().project;
        return ok(commandId, project ? {
          id: project.id,
          name: project.name,
          bpm: project.bpm,
          keyScale: project.keyScale,
          timeSignature: project.timeSignature,
          trackCount: project.tracks.length,
          tracks: project.tracks.map((track) => ({
            id: track.id,
            displayName: track.displayName,
            trackName: track.trackName,
            trackType: track.trackType ?? 'stems',
            clipCount: track.clips.length,
          })),
        } : null);
      }
      case 'transport.play':
        useTransportStore.getState().play();
        return ok(commandId, { isPlaying: useTransportStore.getState().isPlaying });
      case 'transport.pause':
        useTransportStore.getState().pause();
        return ok(commandId, { isPlaying: useTransportStore.getState().isPlaying });
      case 'transport.stop':
        useTransportStore.getState().stop();
        return ok(commandId, {
          isPlaying: useTransportStore.getState().isPlaying,
          currentTime: useTransportStore.getState().currentTime,
        });
      case 'transport.record.toggle': {
        const transport = useTransportStore.getState();
        transport.setIsRecording(!transport.isRecording);
        return ok(commandId, { isRecording: useTransportStore.getState().isRecording });
      }
      case 'transport.loop.toggle':
        useTransportStore.getState().toggleLoop();
        return ok(commandId, { loopEnabled: useTransportStore.getState().loopEnabled });
      case 'transport.metronome.toggle':
        useTransportStore.getState().toggleMetronome();
        return ok(commandId, { metronomeEnabled: useTransportStore.getState().metronomeEnabled });
      case 'track.add': {
        const track = useProjectStore.getState().addTrack(
          (payload as unknown as TrackAddCommandArgs).trackName,
          (payload as unknown as TrackAddCommandArgs).trackType,
        );
        return ok(commandId, track);
      }
      case 'track.add.drums':
        return executeCommand('track.add', { trackName: 'drums' });
      case 'track.add.bass':
        return executeCommand('track.add', { trackName: 'bass' });
      case 'track.add.piano':
        return executeCommand('track.add', { trackName: 'keyboard', trackType: 'pianoRoll' });
      case 'track.add.sampler':
        return executeCommand('track.add', { trackName: 'keyboard', trackType: 'pianoRoll' });
      case 'track.add.drumMachine':
        return executeCommand('track.add', { trackName: 'drums', trackType: 'drumMachine' });
      case 'track.select': {
        const input = payload as unknown as TrackSelectCommandArgs;
        const track = getTrack(input.trackId);
        if (!track) {
          return fail(commandId, buildError('TRACK_NOT_FOUND', `Track '${input.trackId}' not found.`, { commandId, trackId: input.trackId }));
        }
        useUIStore.getState().selectTrack(input.trackId, input.multi);
        return ok(commandId, { selectedTrackIds: [...useUIStore.getState().selectedTrackIds] });
      }
      case 'track.list': {
        const tracks = useProjectStore.getState().project?.tracks ?? [];
        return ok(commandId, tracks.map((track) => ({
          id: track.id,
          displayName: track.displayName,
          trackName: track.trackName,
          trackType: track.trackType ?? 'stems',
          clipCount: track.clips.length,
          sequencerRowCount: track.sequencerPattern?.rows.length ?? 0,
        })));
      }
      case 'clip.createMidi': {
        const input = payload as unknown as ClipCreateMidiCommandArgs;
        const track = getTrack(input.trackId);
        if (!track) {
          return fail(commandId, buildError('TRACK_NOT_FOUND', `Track '${input.trackId}' not found.`, { commandId, trackId: input.trackId }));
        }
        const clip = useProjectStore.getState().ensureMidiClip(input.trackId, input.startTime, input.duration);
        return ok(commandId, clip);
      }
      case 'clip.cover.open': {
        const input = payload as unknown as ClipCoverOpenCommandArgs;
        const clip = getClip(input.clipId);
        if (!clip) {
          return fail(commandId, buildError('CLIP_NOT_FOUND', `Clip '${input.clipId}' not found.`, { commandId, clipId: input.clipId }));
        }
        useUIStore.getState().setCoverModal(input.clipId);
        return ok(commandId, { clipId: input.clipId, coverOpenForClipId: input.clipId });
      }
      case 'clip.select': {
        const input = payload as unknown as ClipSelectCommandArgs;
        const clip = getClip(input.clipId);
        if (!clip) {
          return fail(commandId, buildError('CLIP_NOT_FOUND', `Clip '${input.clipId}' not found.`, { commandId, clipId: input.clipId }));
        }
        useUIStore.getState().selectClip(input.clipId, input.multi);
        return ok(commandId, { selectedClipIds: [...useUIStore.getState().selectedClipIds] });
      }
      case 'clip.list': {
        const trackId = typeof payload.trackId === 'string' ? payload.trackId : undefined;
        const tracks = useProjectStore.getState().project?.tracks ?? [];
        const filteredTracks = trackId ? tracks.filter((track) => track.id === trackId) : tracks;
        if (trackId && filteredTracks.length === 0) {
          return fail(commandId, buildError('TRACK_NOT_FOUND', `Track '${trackId}' not found.`, { commandId, trackId }));
        }
        return ok(commandId, filteredTracks.flatMap((track) => track.clips.map((clip) => ({
          id: clip.id,
          trackId: track.id,
          trackName: track.displayName,
          startTime: clip.startTime,
          duration: clip.duration,
          hasMidi: Boolean(clip.midiData),
          noteCount: clip.midiData?.notes.length ?? 0,
        }))));
      }
      case 'pianoroll.open': {
        const input = payload as unknown as PianoRollOpenCommandArgs;
        const track = getTrack(input.trackId);
        if (!track) {
          return fail(commandId, buildError('TRACK_NOT_FOUND', `Track '${input.trackId}' not found.`, { commandId, trackId: input.trackId }));
        }
        useUIStore.getState().setOpenPianoRoll(input.trackId, input.clipId ?? null);
        return ok(commandId, {
          openPianoRollTrackId: useUIStore.getState().openPianoRollTrackId,
          openPianoRollClipId: useUIStore.getState().openPianoRollClipId,
        });
      }
      case 'pianoroll.note.add': {
        const result = projectActionApi.addMidiNote({
            clipId: (payload as unknown as PianoRollNoteAddCommandArgs).clipId,
            note: {
            pitch: (payload as unknown as PianoRollNoteAddCommandArgs).pitch,
            startBeat: (payload as unknown as PianoRollNoteAddCommandArgs).startBeat,
            durationBeats: (payload as unknown as PianoRollNoteAddCommandArgs).durationBeats,
            velocity: (payload as unknown as PianoRollNoteAddCommandArgs).velocity,
            },
          });
        if (!result.ok) {
          return mapActionFailure(commandId, result.error);
        }
        return ok(commandId, result.value);
      }
      case 'pianoroll.note.resize': {
        const input = payload as unknown as PianoRollNoteResizeCommandArgs;
        const note = getClip(input.clipId)?.midiData?.notes.find((item) => item.id === input.noteId);
        if (!note) {
          return fail(commandId, buildError('NOTE_NOT_FOUND', `MIDI note '${input.noteId}' not found.`, { commandId, clipId: input.clipId, noteId: input.noteId }));
        }
        const result = projectActionApi.resizeMidiNote(input);
        if (!result.ok) {
          return mapActionFailure(commandId, result.error);
        }
        return ok(commandId, result.value);
      }
      case 'pianoroll.tool.set': {
        const input = payload as unknown as PianoRollToolSetCommandArgs;
        if (!PIANO_ROLL_TOOLS.has(input.tool)) {
          return fail(commandId, buildError('INVALID_ARGUMENTS', `Unknown piano roll tool '${input.tool}'.`, { commandId, tool: input.tool }));
        }
        useUIStore.getState().setActivePianoRollTool(input.tool);
        return ok(commandId, { tool: useUIStore.getState().activePianoRollTool });
      }
      case 'sequencer.open': {
        const input = payload as unknown as SequencerOpenCommandArgs;
        const track = getTrack(input.trackId);
        if (!track) {
          return fail(commandId, buildError('TRACK_NOT_FOUND', `Track '${input.trackId}' not found.`, { commandId, trackId: input.trackId }));
        }
        if (track.trackType === 'drumMachine') {
          useUIStore.getState().setOpenDrumMachineTrackId(input.trackId);
        } else {
          useUIStore.getState().setOpenSequencerTrackId(input.trackId);
        }
        return ok(commandId, {
          openSequencerTrackId: useUIStore.getState().openSequencerTrackId,
          openDrumMachineTrackId: useUIStore.getState().openDrumMachineTrackId,
        });
      }
      case 'sequencer.step.toggle': {
        const result = projectActionApi.toggleSequencerStep(payload as unknown as SequencerStepToggleCommandArgs);
        if (!result.ok) {
          return mapActionFailure(commandId, result.error);
        }
        return ok(commandId, result.value);
      }
      case 'sequencer.pattern.inspect': {
        const input = payload as unknown as SequencerPatternInspectCommandArgs;
        const track = getTrack(input.trackId);
        if (!track) {
          return fail(commandId, buildError('TRACK_NOT_FOUND', `Track '${input.trackId}' not found.`, { commandId, trackId: input.trackId }));
        }
        return ok(commandId, {
          trackId: track.id,
          trackName: track.displayName,
          trackType: track.trackType ?? 'stems',
          pattern: track.sequencerPattern ?? null,
        });
      }
      case 'postProduction.open': {
        const input = payload as unknown as PostProductionOpenCommandArgs;
        const taskType = input.taskType ?? 'repair';
        const task = openPostProduction(taskType);
        return ok(commandId, {
          isOpen: usePostProductionStore.getState().isOpen,
          step: usePostProductionStore.getState().step,
          task,
        });
      }
      case 'postProduction.startRepair': {
        const task = await startRepairTask(payload as unknown as PostProductionStartRepairCommandArgs);
        return task.status === 'error' && task.lastError
          ? fail(commandId, buildError(task.lastError.code as AgentCliErrorCode, task.lastError.message, task.lastError.context, task.lastError.recoverySuggestions.map((label) => ({ action: 'postProduction.open', label }))))
          : ok(commandId, task);
      }
      case 'postProduction.startExtend': {
        const task = await startExtendTask(payload as unknown as PostProductionStartExtendCommandArgs);
        return task.status === 'error' && task.lastError
          ? fail(commandId, buildError(task.lastError.code as AgentCliErrorCode, task.lastError.message, task.lastError.context, task.lastError.recoverySuggestions.map((label) => ({ action: 'postProduction.open', label }))))
          : ok(commandId, task);
      }
      case 'postProduction.startPolish': {
        const task = await startPolishTask(payload as unknown as PostProductionStartPolishCommandArgs);
        return task.status === 'error' && task.lastError
          ? fail(commandId, buildError(task.lastError.code as AgentCliErrorCode, task.lastError.message, task.lastError.context, task.lastError.recoverySuggestions.map((label) => ({ action: 'postProduction.open', label }))))
          : ok(commandId, task);
      }
      case 'postProduction.getTaskState':
        return ok(commandId, getPostProductionTaskState());
      case 'postProduction.runNextStep': {
        const nextTask = runNextPostProductionStep();
        return nextTask.status === 'error' && nextTask.lastError
          ? fail(commandId, buildError(
            nextTask.lastError.code === 'TASK_NOT_READY' ? 'POST_PRODUCTION_TASK_NOT_READY' : nextTask.lastError.code as AgentCliErrorCode,
            nextTask.lastError.message,
            nextTask.lastError.context,
            nextTask.lastError.recoverySuggestions.map((label) => ({ action: 'postProduction.getTaskState', label })),
          ))
          : ok(commandId, nextTask);
      }
      case 'panel.toggle': {
        const input = payload as unknown as PanelToggleCommandArgs;
        if (!PANEL_VALUES.has(input.panel)) {
          return fail(commandId, buildError('INVALID_PANEL', `Unknown panel '${input.panel}'.`, { commandId, panel: input.panel }));
        }
        switch (input.panel) {
          case 'mixer':
            useUIStore.getState().setShowMixer(!useUIStore.getState().showMixer);
            return ok(commandId, { panel: input.panel, open: useUIStore.getState().showMixer });
          case 'library':
            useUIStore.getState().setShowLibrary(!useUIStore.getState().showLibrary);
            return ok(commandId, { panel: input.panel, open: useUIStore.getState().showLibrary });
          case 'smartControls':
            useUIStore.getState().setShowSmartControls(!useUIStore.getState().showSmartControls);
            return ok(commandId, { panel: input.panel, open: useUIStore.getState().showSmartControls });
          case 'generation':
            useUIStore.getState().toggleGenerationPanel();
            return ok(commandId, { panel: input.panel, open: useUIStore.getState().showGenerationPanel });
          case 'commandPalette':
            if (useUIStore.getState().showCommandPalette) useUIStore.getState().closeCommandPalette();
            else useUIStore.getState().openCommandPalette();
            return ok(commandId, { panel: input.panel, open: useUIStore.getState().showCommandPalette });
          case 'loopBrowser':
            useUIStore.getState().toggleLoopBrowser();
            return ok(commandId, { panel: input.panel, open: useUIStore.getState().loopBrowserOpen });
          case 'tempoLane':
            useUIStore.getState().toggleTempoLane();
            return ok(commandId, { panel: input.panel, open: useUIStore.getState().showTempoLane });
          case 'aiAssistant':
            useUIStore.getState().toggleAIAssistant();
            return ok(commandId, { panel: input.panel, open: useUIStore.getState().showAIAssistant });
        }
        return fail(commandId, buildError('INVALID_PANEL', `Unknown panel '${input.panel}'.`, { commandId, panel: input.panel }));
      }
      case 'panel.toggle.library':
        return executeCommand('panel.toggle', { panel: 'library' });
      case 'panel.toggle.mixer':
        return executeCommand('panel.toggle', { panel: 'mixer' });
      case 'panel.toggle.smartControls':
        return executeCommand('panel.toggle', { panel: 'smartControls' });
      case 'panel.toggle.generation':
        return executeCommand('panel.toggle', { panel: 'generation' });
      case 'panel.toggle.commandPalette':
        return executeCommand('panel.toggle', { panel: 'commandPalette' });
      case 'panel.toggle.loopBrowser':
        return executeCommand('panel.toggle', { panel: 'loopBrowser' });
      case 'panel.toggle.tempoLane':
        return executeCommand('panel.toggle', { panel: 'tempoLane' });
      case 'panel.toggle.aiAssistant':
        return executeCommand('panel.toggle', { panel: 'aiAssistant' });
      default:
        return fail(commandId, buildError('COMMAND_NOT_FOUND', `Unknown command '${commandId}'.`, { commandId }));
    }
  } catch (error) {
    return fail(commandId, buildError(
      'ACTION_FAILED',
      error instanceof Error ? error.message : 'Command failed unexpectedly.',
      { commandId, args: payload },
    ));
  }
}

let lastResult: AgentCliCommandResult | null = null;

export function createAgentCliRuntime(): AgentCliGlobal {
  return {
    listCommands() {
      return COMMAND_DESCRIPTORS;
    },
    describeCommand(id) {
      return COMMAND_DESCRIPTOR_MAP.get(id) ?? null;
    },
    async execute(id, args) {
      const result = await executeCommand(id, (args ?? {}) as Record<string, unknown>);
      lastResult = result;
      return result;
    },
    async batch(requests: AgentCliBatchRequest[]): Promise<AgentCliBatchResult> {
      const results: AgentCliCommandResult[] = [];
      for (let index = 0; index < requests.length; index += 1) {
        const request = requests[index];
        const result = await executeCommand(request.id, request.args);
        results.push(result);
        lastResult = result;
        if (!result.ok) {
          return { ok: false, stoppedOnError: true, failedIndex: index, results };
        }
      }
      return { ok: true, stoppedOnError: false, failedIndex: null, results };
    },
    getLastResult() {
      return lastResult;
    },
  };
}

const agentCliRuntime = createAgentCliRuntime();

export function getAgentCliRuntime(): AgentCliGlobal {
  return agentCliRuntime;
}
