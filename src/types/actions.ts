import type { BounceInPlaceOptions, Clip, MidiNote, Track, TrackPreset } from './project';
import type { StemCount } from './api';

export type DawActionErrorCode =
  | 'PROJECT_REQUIRED'
  | 'TRACK_NOT_FOUND'
  | 'TRACK_PRESET_NOT_FOUND'
  | 'CLIP_NOT_FOUND'
  | 'CLIP_SELECTION_REQUIRED'
  | 'PRESET_NAME_REQUIRED'
  | 'MIDI_CLIP_REQUIRED'
  | 'MIDI_NOTES_REQUIRED'
  | 'AUDIO_CLIP_REQUIRED'
  | 'AUDIO_SOURCE_MISSING'
  | 'SEQUENCER_PATTERN_REQUIRED'
  | 'SEQUENCER_ROW_NOT_FOUND'
  | 'STEP_INDEX_OUT_OF_RANGE'
  | 'ACTION_FAILED';

export interface DawActionSuggestion {
  action: string;
  label: string;
  params?: Record<string, unknown>;
}

export interface DawActionError {
  code: DawActionErrorCode;
  message: string;
  context: Record<string, unknown>;
  suggestions: DawActionSuggestion[];
}

export type DawActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: DawActionError };

export interface AddClipActionInput {
  trackId: string;
  clip: Omit<Clip, 'id' | 'trackId' | 'generationStatus' | 'generationJobId' | 'cumulativeMixKey' | 'isolatedAudioKey' | 'waveformPeaks'>;
}

export interface ToggleSequencerStepActionInput {
  trackId: string;
  rowId: string;
  stepIndex: number;
}

export interface AddMidiNoteActionInput {
  clipId: string;
  note: Omit<MidiNote, 'id'> & { id?: string };
}

export interface SaveTrackPresetActionInput {
  trackId: string;
  presetName: string;
}

export interface ApplyTrackPresetActionInput {
  presetId: string;
}

export interface ConsolidateClipsActionInput {
  trackId: string;
  clipIds: string[];
}

export interface SeparateStemsActionInput {
  clipId: string;
  stemCount: StemCount;
}

export interface BounceInPlaceActionInput {
  trackId: string;
  options?: Partial<BounceInPlaceOptions>;
}

export interface ExportMidiClipActionInput {
  clipId: string;
}

export interface ExportMidiSuccess {
  clipId: string;
  fileName: string;
  noteCount: number;
}

export interface AddMidiNoteSuccess {
  clipId: string;
  noteId: string;
}

export interface ToggleSequencerStepSuccess {
  trackId: string;
  rowId: string;
  stepIndex: number;
  active: boolean;
}

export interface ProjectActionApi {
  addClip: (input: AddClipActionInput) => DawActionResult<Clip>;
  toggleSequencerStep: (input: ToggleSequencerStepActionInput) => DawActionResult<ToggleSequencerStepSuccess>;
  addMidiNote: (input: AddMidiNoteActionInput) => DawActionResult<AddMidiNoteSuccess>;
  saveTrackPreset: (input: SaveTrackPresetActionInput) => DawActionResult<TrackPreset>;
  applyTrackPreset: (input: ApplyTrackPresetActionInput) => DawActionResult<Track>;
  consolidateClips: (input: ConsolidateClipsActionInput) => Promise<DawActionResult<Clip>>;
  separateStems: (input: SeparateStemsActionInput) => Promise<DawActionResult<Track[]>>;
  bounceInPlace: (input: BounceInPlaceActionInput) => Promise<DawActionResult<Clip>>;
  exportMidiClip: (input: ExportMidiClipActionInput) => DawActionResult<ExportMidiSuccess>;
  getLastError: () => DawActionError | null;
  clearLastError: () => void;
}
