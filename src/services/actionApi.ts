import type { StoreApi, UseBoundStore } from 'zustand';
import { encodeMidiFile } from '../utils/midi';
import { useProjectStore, type ProjectState } from '../store/projectStore';
import type {
  AddClipActionInput,
  AddMidiNoteActionInput,
  AddMidiNoteSuccess,
  ApplyTrackPresetActionInput,
  BounceInPlaceActionInput,
  ConsolidateClipsActionInput,
  DawActionError,
  DawActionErrorCode,
  DawActionResult,
  ExportMidiClipActionInput,
  ExportMidiSuccess,
  ProjectActionApi,
  ResizeMidiNoteActionInput,
  ResizeMidiNoteSuccess,
  SaveTrackPresetActionInput,
  SeparateStemsActionInput,
  ToggleSequencerStepActionInput,
  ToggleSequencerStepSuccess,
} from '../types/actions';

type ProjectStore = UseBoundStore<StoreApi<ProjectState>>;

function sanitizeFileNameSegment(value: string) {
  const trimmed = value.trim().replace(/[\\/:*?"<>|]/g, ' ');
  return trimmed.replace(/\s+/g, ' ').trim() || 'untitled';
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildError(
  code: DawActionErrorCode,
  message: string,
  context: Record<string, unknown>,
  suggestions: DawActionError['suggestions'],
): DawActionError {
  return { code, message, context, suggestions };
}

function ok<T>(value: T): DawActionResult<T> {
  return { ok: true, value };
}

function err<T>(error: DawActionError): DawActionResult<T> {
  return { ok: false, error };
}

function getProjectRequiredError(action: string): DawActionError {
  return buildError(
    'PROJECT_REQUIRED',
    'Create or open a project before running this action.',
    { action },
    [
      { action: 'createProject', label: 'Create a new project' },
      { action: 'setProject', label: 'Load an existing project' },
    ],
  );
}

function withUnexpectedError<T>(action: string, context: Record<string, unknown>, error: unknown): DawActionResult<T> {
  const message = error instanceof Error ? error.message : 'The action failed unexpectedly.';
  return err(buildError(
    'ACTION_FAILED',
    message,
    { action, ...context },
    [
      { action: 'retryAction', label: 'Retry the action once' },
      { action: 'inspectProjectState', label: 'Inspect project state before retrying' },
    ],
  ));
}

export function createProjectActionApi(store: ProjectStore): ProjectActionApi {
  let lastError: DawActionError | null = null;

  const capture = <T>(result: DawActionResult<T>) => {
    lastError = result.ok ? null : result.error;
    return result;
  };

  return {
    addClip: ({ trackId, clip }: AddClipActionInput) => {
      const state = store.getState();
      const project = state.project;
      if (!project) {
        return capture(err(getProjectRequiredError('addClip')));
      }

      const track = project.tracks.find((candidate) => candidate.id === trackId);
      if (!track) {
        return capture(err(buildError(
          'TRACK_NOT_FOUND',
          `Track '${trackId}' not found.`,
          { action: 'addClip', trackId },
          [
            { action: 'addTrack', label: 'Create a target track' },
            { action: 'listTracks', label: 'Inspect available track IDs' },
          ],
        )));
      }

      try {
        return capture(ok(state.addClip(trackId, clip)));
      } catch (error) {
        return capture(withUnexpectedError('addClip', { trackId }, error));
      }
    },

    toggleSequencerStep: ({ trackId, rowId, stepIndex }: ToggleSequencerStepActionInput) => {
      const state = store.getState();
      const project = state.project;
      if (!project) {
        return capture(err(getProjectRequiredError('toggleSequencerStep')));
      }

      const track = project.tracks.find((candidate) => candidate.id === trackId);
      if (!track) {
        return capture(err(buildError(
          'TRACK_NOT_FOUND',
          `Track '${trackId}' not found.`,
          { action: 'toggleSequencerStep', trackId, rowId, stepIndex },
          [
            { action: 'listTracks', label: 'Inspect available track IDs' },
          ],
        )));
      }

      if (!track.sequencerPattern) {
        return capture(err(buildError(
          'SEQUENCER_PATTERN_REQUIRED',
          `Track '${track.displayName}' does not have a sequencer pattern.`,
          { action: 'toggleSequencerStep', trackId, rowId, stepIndex },
          [
            { action: 'initSequencerPattern', label: 'Initialize a sequencer pattern', params: { trackId } },
          ],
        )));
      }

      const row = track.sequencerPattern.rows.find((candidate) => candidate.id === rowId);
      if (!row) {
        return capture(err(buildError(
          'SEQUENCER_ROW_NOT_FOUND',
          `Sequencer row '${rowId}' not found on track '${track.displayName}'.`,
          { action: 'toggleSequencerStep', trackId, rowId, stepIndex },
          [
            { action: 'listSequencerRows', label: 'List sequencer rows for this track', params: { trackId } },
          ],
        )));
      }

      if (stepIndex < 0 || stepIndex >= row.steps.length) {
        return capture(err(buildError(
          'STEP_INDEX_OUT_OF_RANGE',
          `Step index ${stepIndex} is outside the row range 0-${row.steps.length - 1}.`,
          { action: 'toggleSequencerStep', trackId, rowId, stepIndex, maxStepIndex: row.steps.length - 1 },
          [
            { action: 'inspectSequencerPattern', label: 'Inspect the sequencer pattern length', params: { trackId, rowId } },
          ],
        )));
      }

      try {
        state.toggleSequencerStep(trackId, rowId, stepIndex);
        const active = Boolean(store.getState().project?.tracks
          .find((candidate) => candidate.id === trackId)
          ?.sequencerPattern?.rows.find((candidate) => candidate.id === rowId)
          ?.steps[stepIndex]?.active);
        const value: ToggleSequencerStepSuccess = { trackId, rowId, stepIndex, active };
        return capture(ok(value));
      } catch (error) {
        return capture(withUnexpectedError('toggleSequencerStep', { trackId, rowId, stepIndex }, error));
      }
    },

    addMidiNote: ({ clipId, note }: AddMidiNoteActionInput) => {
      const state = store.getState();
      const project = state.project;
      if (!project) {
        return capture(err(getProjectRequiredError('addMidiNote')));
      }

      const clip = project.tracks.flatMap((track) => track.clips).find((candidate) => candidate.id === clipId);
      if (!clip) {
        return capture(err(buildError(
          'CLIP_NOT_FOUND',
          `Clip '${clipId}' not found.`,
          { action: 'addMidiNote', clipId },
          [
            { action: 'listClips', label: 'Inspect available clip IDs' },
          ],
        )));
      }

      if (!clip.midiData) {
        return capture(err(buildError(
          'MIDI_CLIP_REQUIRED',
          `Clip '${clipId}' is not a MIDI clip.`,
          { action: 'addMidiNote', clipId },
          [
            { action: 'ensureMidiClip', label: 'Create or convert to a MIDI clip', params: { trackId: clip.trackId } },
          ],
        )));
      }

      const noteId = state.addMidiNote(clipId, note);
      if (!noteId) {
        return capture(withUnexpectedError('addMidiNote', { clipId }, new Error('Unable to create MIDI note')));
      }

      const value: AddMidiNoteSuccess = { clipId, noteId };
      return capture(ok(value));
    },

    resizeMidiNote: ({ clipId, noteId, edge, startBeat, endBeat, minDurationBeats }: ResizeMidiNoteActionInput) => {
      const state = store.getState();
      const project = state.project;
      if (!project) {
        return capture(err(getProjectRequiredError('resizeMidiNote')));
      }

      const clip = project.tracks.flatMap((track) => track.clips).find((candidate) => candidate.id === clipId);
      if (!clip) {
        return capture(err(buildError(
          'CLIP_NOT_FOUND',
          `Clip '${clipId}' not found.`,
          { action: 'resizeMidiNote', clipId, noteId, edge },
          [
            { action: 'listClips', label: 'Inspect available clip IDs' },
          ],
        )));
      }

      if (!clip.midiData) {
        return capture(err(buildError(
          'MIDI_CLIP_REQUIRED',
          `Clip '${clipId}' is not a MIDI clip.`,
          { action: 'resizeMidiNote', clipId, noteId, edge },
          [
            { action: 'ensureMidiClip', label: 'Create or convert to a MIDI clip', params: { trackId: clip.trackId } },
          ],
        )));
      }

      const note = clip.midiData.notes.find((candidate) => candidate.id === noteId);
      if (!note) {
        return capture(err(buildError(
          'MIDI_NOTES_REQUIRED',
          `MIDI note '${noteId}' not found in clip '${clipId}'.`,
          { action: 'resizeMidiNote', clipId, noteId, edge },
          [
            { action: 'inspectMidiNotes', label: 'Inspect available MIDI note IDs', params: { clipId } },
          ],
        )));
      }

      try {
        state.resizeMidiNote(clipId, noteId, { edge, startBeat, endBeat, minDurationBeats });
        const resizedNote = store.getState().project?.tracks
          .flatMap((track) => track.clips)
          .find((candidate) => candidate.id === clipId)
          ?.midiData?.notes.find((candidate) => candidate.id === noteId);
        if (!resizedNote) {
          return capture(withUnexpectedError('resizeMidiNote', { clipId, noteId, edge }, new Error('Unable to resize MIDI note')));
        }

        const value: ResizeMidiNoteSuccess = {
          clipId,
          noteId,
          startBeat: resizedNote.startBeat,
          durationBeats: resizedNote.durationBeats,
        };
        return capture(ok(value));
      } catch (error) {
        return capture(withUnexpectedError('resizeMidiNote', { clipId, noteId, edge }, error));
      }
    },

    saveTrackPreset: ({ trackId, presetName }: SaveTrackPresetActionInput) => {
      const state = store.getState();
      const project = state.project;
      if (!project) {
        return capture(err(getProjectRequiredError('saveTrackPreset')));
      }

      if (!project.tracks.some((candidate) => candidate.id === trackId)) {
        return capture(err(buildError(
          'TRACK_NOT_FOUND',
          `Track '${trackId}' not found.`,
          { action: 'saveTrackPreset', trackId, presetName },
          [
            { action: 'listTracks', label: 'Inspect available track IDs' },
          ],
        )));
      }

      if (!presetName.trim()) {
        return capture(err(buildError(
          'PRESET_NAME_REQUIRED',
          'Preset name is required.',
          { action: 'saveTrackPreset', trackId },
          [
            { action: 'setPresetName', label: 'Provide a non-empty preset name' },
          ],
        )));
      }

      if (state.isViewerMode()) {
        return capture(err(buildError(
          'ACTION_FAILED',
          'Track presets cannot be saved while the project is open in viewer mode.',
          { action: 'saveTrackPreset', trackId, presetName },
          [
            { action: 'requestEditAccess', label: 'Request edit access before saving presets' },
          ],
        )));
      }

      try {
        const preset = state.saveTrackPreset(trackId, presetName);
        if (!preset) {
          return capture(withUnexpectedError('saveTrackPreset', { trackId }, new Error('Unable to save track preset')));
        }
        return capture(ok(preset));
      } catch (error) {
        return capture(withUnexpectedError('saveTrackPreset', { trackId }, error));
      }
    },

    applyTrackPreset: ({ presetId }: ApplyTrackPresetActionInput) => {
      const state = store.getState();
      const project = state.project;
      if (!project) {
        return capture(err(getProjectRequiredError('applyTrackPreset')));
      }

      if (!(project.trackPresets ?? []).some((candidate) => candidate.id === presetId)) {
        return capture(err(buildError(
          'TRACK_PRESET_NOT_FOUND',
          `Track preset '${presetId}' not found.`,
          { action: 'applyTrackPreset', presetId },
          [
            { action: 'listTrackPresets', label: 'Inspect available track presets' },
          ],
        )));
      }

      if (state.isViewerMode()) {
        return capture(err(buildError(
          'ACTION_FAILED',
          'Track presets cannot be applied while the project is open in viewer mode.',
          { action: 'applyTrackPreset', presetId },
          [
            { action: 'requestEditAccess', label: 'Request edit access before applying presets' },
          ],
        )));
      }

      const track = state.applyTrackPreset(presetId);
      if (!track) {
        return capture(withUnexpectedError('applyTrackPreset', { presetId }, new Error('Unable to apply track preset')));
      }

      return capture(ok(track));
    },

    consolidateClips: async ({ trackId, clipIds }: ConsolidateClipsActionInput) => {
      const state = store.getState();
      const project = state.project;
      if (!project) {
        return capture(err(getProjectRequiredError('consolidateClips')));
      }

      const track = project.tracks.find((candidate) => candidate.id === trackId);
      if (!track) {
        return capture(err(buildError(
          'TRACK_NOT_FOUND',
          `Track '${trackId}' not found.`,
          { action: 'consolidateClips', trackId, clipIds },
          [
            { action: 'listTracks', label: 'Inspect available track IDs' },
          ],
        )));
      }

      if (clipIds.length === 0) {
        return capture(err(buildError(
          'CLIP_SELECTION_REQUIRED',
          'Select at least one clip before consolidating.',
          { action: 'consolidateClips', trackId, clipIds },
          [
            { action: 'selectClips', label: 'Select one or more clips on the same track', params: { trackId } },
          ],
        )));
      }

      const resolvedClipIds = new Set(track.clips.map((clip) => clip.id));
      const missingClipId = clipIds.find((clipId) => !resolvedClipIds.has(clipId));
      if (missingClipId) {
        return capture(err(buildError(
          'CLIP_NOT_FOUND',
          `Clip '${missingClipId}' not found on track '${track.displayName}'.`,
          { action: 'consolidateClips', trackId, clipIds, missingClipId },
          [
            { action: 'listClips', label: 'Inspect clips on the selected track', params: { trackId } },
          ],
        )));
      }

      try {
        const clip = await state.consolidateClips(trackId, clipIds);
        if (!clip) {
          return capture(withUnexpectedError('consolidateClips', { trackId, clipIds }, new Error('Clip consolidation returned no result')));
        }
        return capture(ok(clip));
      } catch (error) {
        return capture(withUnexpectedError('consolidateClips', { trackId, clipIds }, error));
      }
    },

    separateStems: async ({ clipId, stemCount }: SeparateStemsActionInput) => {
      const state = store.getState();
      const project = state.project;
      if (!project) {
        return capture(err(getProjectRequiredError('separateStems')));
      }

      const track = project.tracks.find((candidate) => candidate.clips.some((clip) => clip.id === clipId));
      if (!track) {
        return capture(err(buildError(
          'TRACK_NOT_FOUND',
          `Track for clip '${clipId}' not found.`,
          { action: 'separateStems', clipId, stemCount },
          [
            { action: 'listClips', label: 'Inspect available clip IDs' },
          ],
        )));
      }

      const clip = track.clips.find((candidate) => candidate.id === clipId);
      if (!clip) {
        return capture(err(buildError(
          'CLIP_NOT_FOUND',
          `Clip '${clipId}' not found.`,
          { action: 'separateStems', clipId, stemCount },
          [
            { action: 'listClips', label: 'Inspect available clip IDs' },
          ],
        )));
      }

      if (!clip.isolatedAudioKey && !clip.cumulativeMixKey) {
        return capture(err(buildError(
          'AUDIO_CLIP_REQUIRED',
          'Stem separation requires an audio clip with rendered audio.',
          { action: 'separateStems', clipId, stemCount },
          [
            { action: 'bounceInPlace', label: 'Bounce or render the source clip first', params: { trackId: track.id } },
          ],
        )));
      }

      try {
        const tracks = await state.separateStems(clipId, stemCount);
        if (!tracks) {
          return capture(withUnexpectedError('separateStems', { clipId, stemCount }, new Error('Stem separation returned no result')));
        }
        return capture(ok(tracks));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Stem separation failed.';
        const code = message.includes('Audio for clip') ? 'AUDIO_SOURCE_MISSING' : 'ACTION_FAILED';
        return capture(err(buildError(
          code,
          message,
          { action: 'separateStems', clipId, stemCount },
          [
            { action: 'inspectClipAudio', label: 'Verify the clip still has accessible audio data', params: { clipId } },
            { action: 'retryAction', label: 'Retry stem separation once' },
          ],
        )));
      }
    },

    bounceInPlace: async ({ trackId, options }: BounceInPlaceActionInput) => {
      const state = store.getState();
      const project = state.project;
      if (!project) {
        return capture(err(getProjectRequiredError('bounceInPlace')));
      }

      if (!project.tracks.some((candidate) => candidate.id === trackId)) {
        return capture(err(buildError(
          'TRACK_NOT_FOUND',
          `Track '${trackId}' not found.`,
          { action: 'bounceInPlace', trackId, options },
          [
            { action: 'listTracks', label: 'Inspect available track IDs' },
          ],
        )));
      }

      try {
        const clip = await state.bounceInPlace(trackId, options);
        if (!clip) {
          return capture(withUnexpectedError('bounceInPlace', { trackId }, new Error('Bounce in place returned no clip')));
        }
        return capture(ok(clip));
      } catch (error) {
        return capture(withUnexpectedError('bounceInPlace', { trackId, options }, error));
      }
    },

    exportMidiClip: ({ clipId }: ExportMidiClipActionInput) => {
      const state = store.getState();
      const project = state.project;
      if (!project) {
        return capture(err(getProjectRequiredError('exportMidiClip')));
      }

      const track = project.tracks.find((candidate) => candidate.clips.some((clip) => clip.id === clipId));
      const clip = track?.clips.find((candidate) => candidate.id === clipId);
      if (!track || !clip) {
        return capture(err(buildError(
          'CLIP_NOT_FOUND',
          `Clip '${clipId}' not found.`,
          { action: 'exportMidiClip', clipId },
          [
            { action: 'listClips', label: 'Inspect available clip IDs' },
          ],
        )));
      }

      if (!clip.midiData) {
        return capture(err(buildError(
          'MIDI_CLIP_REQUIRED',
          `Clip '${clipId}' is not a MIDI clip.`,
          { action: 'exportMidiClip', clipId, trackId: track.id },
          [
            { action: 'ensureMidiClip', label: 'Create or convert to a MIDI clip', params: { trackId: track.id } },
          ],
        )));
      }

      if (clip.midiData.notes.length === 0) {
        return capture(err(buildError(
          'MIDI_NOTES_REQUIRED',
          'MIDI clip has no notes to export.',
          { action: 'exportMidiClip', clipId, trackId: track.id },
          [
            { action: 'addMidiNote', label: 'Add at least one MIDI note', params: { clipId } },
          ],
        )));
      }

      const numerator = project.timeSignatureMap?.[0]?.numerator ?? project.timeSignature;
      const denominator = project.timeSignatureMap?.[0]?.denominator ?? 4;
      const clipDurationBeats = Math.max(
        clip.duration * (project.bpm / 60),
        clip.midiData.notes.reduce((max, note) => Math.max(max, note.startBeat + note.durationBeats), 0),
      );

      const bytes = encodeMidiFile(clip.midiData.notes, {
        bpm: project.bpm,
        timeSignature: { numerator, denominator },
        trackName: track.displayName,
        clipDurationBeats,
      });

      const baseFileName = [
        sanitizeFileNameSegment(project.name),
        sanitizeFileNameSegment(track.displayName),
        sanitizeFileNameSegment(clip.prompt || 'midi-clip'),
      ].join('_');
      const fileName = `${baseFileName}.mid`;

      downloadBlob(new Blob([Uint8Array.from(bytes)], { type: 'audio/midi' }), fileName);

      const value: ExportMidiSuccess = {
        clipId,
        fileName,
        noteCount: clip.midiData.notes.length,
      };
      return capture(ok(value));
    },

    getLastError: () => lastError,
    clearLastError: () => {
      lastError = null;
    },
  };
}

export const projectActionApi = createProjectActionApi(useProjectStore);
