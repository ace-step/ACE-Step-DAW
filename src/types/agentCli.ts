import type { PianoRollTool } from '../components/pianoroll/PianoRollConstants';
import type { DawActionErrorCode } from './actions';
import type { Project, TrackName, TrackType } from './project';
import type { LoudnessTarget, MasteringPreset } from './project';
import type { PostProductionContextMode } from './postProduction';

export type AgentCliArgType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface AgentCliArgSchemaEntry {
  type: AgentCliArgType;
  required?: boolean;
  description: string;
}

export interface AgentCliRecoverySuggestion {
  action: string;
  label: string;
  params?: Record<string, unknown>;
}

export type AgentCliErrorCode =
  | DawActionErrorCode
  | 'COMMAND_NOT_FOUND'
  | 'INVALID_ARGUMENTS'
  | 'INVALID_PROJECT_PAYLOAD'
  | 'INVALID_PANEL'
  | 'NOTE_NOT_FOUND'
  | 'POST_PRODUCTION_TASK_NOT_READY';

export interface AgentCliError {
  code: AgentCliErrorCode;
  message: string;
  context: Record<string, unknown>;
  recoverySuggestions: AgentCliRecoverySuggestion[];
}

export interface AgentCliCommandDescriptor {
  id: string;
  title: string;
  category: 'project' | 'transport' | 'track' | 'clip' | 'pianoRoll' | 'sequencer' | 'panel' | 'postProduction';
  description: string;
  argsSchema: Record<string, AgentCliArgSchemaEntry>;
  requiresProject: boolean;
  undoable: boolean;
  selectors?: string[];
}

export type AgentCliCommandResult =
  | {
      ok: true;
      commandId: string;
      timestamp: number;
      value: unknown;
    }
  | {
      ok: false;
      commandId: string;
      timestamp: number;
      error: AgentCliError;
    };

export interface AgentCliBatchRequest {
  id: string;
  args?: Record<string, unknown>;
}

export interface AgentCliBatchResult {
  ok: boolean;
  stoppedOnError: boolean;
  failedIndex: number | null;
  results: AgentCliCommandResult[];
}

export interface AgentCliGlobal {
  listCommands(): AgentCliCommandDescriptor[];
  describeCommand(id: string): AgentCliCommandDescriptor | null;
  execute<TArgs = Record<string, unknown>>(id: string, args?: TArgs): Promise<AgentCliCommandResult>;
  batch(requests: AgentCliBatchRequest[]): Promise<AgentCliBatchResult>;
  getLastResult(): AgentCliCommandResult | null;
}

export interface ProjectCreateCommandArgs {
  name?: string;
  bpm?: number;
  keyScale?: string;
  timeSignature?: number;
}

export interface ProjectOpenCommandArgs {
  project: Project;
}

export interface TrackAddCommandArgs {
  trackName: TrackName;
  trackType?: TrackType;
}

export interface TrackSelectCommandArgs {
  trackId: string;
  multi?: boolean;
}

export interface ClipCreateMidiCommandArgs {
  trackId: string;
  startTime?: number;
  duration?: number;
}

export interface ClipSelectCommandArgs {
  clipId: string;
  multi?: boolean;
}

export interface ClipCoverOpenCommandArgs {
  clipId: string;
}

export interface PianoRollOpenCommandArgs {
  trackId: string;
  clipId?: string | null;
}

export interface PianoRollNoteAddCommandArgs {
  clipId: string;
  pitch: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
}

export interface PianoRollNoteResizeCommandArgs {
  clipId: string;
  noteId: string;
  edge: 'left' | 'right';
  startBeat?: number;
  endBeat?: number;
  minDurationBeats?: number;
}

export interface PianoRollToolSetCommandArgs {
  tool: PianoRollTool;
}

export interface SequencerOpenCommandArgs {
  trackId: string;
}

export interface SequencerStepToggleCommandArgs {
  trackId: string;
  rowId: string;
  stepIndex: number;
}

export interface SequencerPatternInspectCommandArgs {
  trackId: string;
}

export interface PanelToggleCommandArgs {
  panel: 'mixer' | 'library' | 'smartControls' | 'generation' | 'commandPalette' | 'loopBrowser' | 'tempoLane' | 'aiAssistant';
}

export interface PostProductionOpenCommandArgs {
  taskType?: 'repair' | 'extend' | 'polish';
}

export interface PostProductionStartRepairCommandArgs {
  clipId?: string;
  startTime?: number;
  endTime?: number;
  prompt?: string;
  lyrics?: string;
  globalCaption?: string;
}

export interface PostProductionStartExtendCommandArgs {
  trackIds?: string[];
  startTime?: number;
  endTime?: number;
  prompt?: string;
  lyrics?: string;
  globalCaption?: string;
  contextMode?: PostProductionContextMode;
}

export interface PostProductionStartPolishCommandArgs {
  preset?: MasteringPreset;
  loudnessTarget?: LoudnessTarget;
}
