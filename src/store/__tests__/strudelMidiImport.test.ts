import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));
vi.mock('../../hooks/useRecording', () => ({
  useRecording: () => ({
    armedTrackIds: [],
    toggleArmTrack: vi.fn(),
  }),
}));
vi.mock('../../hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    getTrackLevel: () => 0,
  }),
}));

import { useProjectStore } from '../projectStore';
import { useUIStore } from '../uiStore';
import { encodeMidiFile } from '../../utils/midi';

describe('MIDI to Strudel store actions', () => {
  beforeEach(() => {
    useProjectStore.getState().createProject('Test Project');
    useUIStore.setState({
      strudelPanelOpen: false,
      openStrudelEditorTrackId: null,
      openPianoRollTrackId: null,
      openPianoRollClipId: null,
    });
  });

  it('converts a MIDI clip and applies it to a strudel track', async () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('keyboard', 'pianoRoll');
    const clip = store.addClip(track.id, {
      startTime: 0,
      duration: 2,
      prompt: 'MIDI Clip',
      lyrics: '',
      source: 'uploaded',
      midiData: {
        notes: [
          { id: 'n1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 },
          { id: 'n2', pitch: 64, startBeat: 1, durationBeats: 1, velocity: 0.8 },
        ],
        grid: '1/16',
      },
    });

    const result = await store.convertMidiClipToStrudel(clip.id);
    expect(result).not.toBeNull();

    const applied = await store.applyStrudelCodeToTrack(result!.code, null, { label: 'Convert MIDI Clip' });
    expect(applied).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 0));

    const project = useProjectStore.getState().project!;
    const strudelTrack = project.tracks.find((candidate) => candidate.id === applied!.trackId);
    expect(strudelTrack?.trackType).toBe('strudel');
    expect(strudelTrack?.strudelCode).toContain('stack(');
    expect(useUIStore.getState().strudelPanelOpen).toBe(true);
    expect(useUIStore.getState().openStrudelEditorTrackId).toBe(applied!.trackId);
  });

  it('converts a piano roll track to strudel code', async () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('keyboard', 'pianoRoll');
    store.addClip(track.id, {
      startTime: 0,
      duration: 2,
      prompt: 'Track MIDI',
      lyrics: '',
      source: 'uploaded',
      midiData: {
        notes: [
          { id: 'n1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 },
          { id: 'n2', pitch: 67, startBeat: 2, durationBeats: 1, velocity: 0.8 },
        ],
        grid: '1/16',
      },
    });

    const result = await store.convertMidiTrackToStrudel(track.id);
    expect(result).not.toBeNull();
    expect(result?.sourceSummary.sourceKind).toBe('track');
    expect(result?.code).toContain('const keyboard');
  });

  it('converts a MIDI file directly to strudel code', async () => {
    const store = useProjectStore.getState();
    const bytes = encodeMidiFile([
      { pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 },
      { pitch: 64, startBeat: 1, durationBeats: 1, velocity: 0.8 },
    ], { bpm: 120, timeSignature: { numerator: 4, denominator: 4 }, trackName: 'Imported File' });

    const file = new File([bytes], 'imported.mid', { type: 'audio/midi' });
    const result = await store.convertMidiFileToStrudel(file);

    expect(result).not.toBeNull();
    expect(result?.sourceSummary.sourceKind).toBe('file');
    expect(result?.code).toContain('// Source: imported');
    expect(result?.code).toContain('stack(');
  });
});
