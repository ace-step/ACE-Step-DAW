import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';
import { processTrackLaneFileDrop } from '../../src/components/timeline/trackLaneFileDrop';
import { encodeMidiFile } from '../../src/utils/midi';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('processTrackLaneFileDrop', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useProjectStore.getState().createProject({
      name: 'Track Lane File Drop Test',
      bpm: 124,
      keyScale: 'C major',
      timeSignature: 4,
    });
  });

  it('converts dropped MIDI files into Strudel code for Strudel tracks', async () => {
    const store = useProjectStore.getState();
    const ui = useUIStore.getState();
    const track = store.addTrack('custom', 'strudel');
    let converted: Awaited<ReturnType<typeof store.convertMidiFileToStrudel>> = null;
    let applied: Awaited<ReturnType<typeof store.applyStrudelCodeToTrack>> = null;
    const midiBytes = encodeMidiFile([
      { pitch: 36, startBeat: 0, durationBeats: 0.5, velocity: 0.9 },
      { pitch: 42, startBeat: 0, durationBeats: 0.25, velocity: 0.8 },
      { pitch: 42, startBeat: 0.5, durationBeats: 0.25, velocity: 0.8 },
      { pitch: 38, startBeat: 1, durationBeats: 0.5, velocity: 0.85 },
    ], {
      bpm: 128,
      timeSignature: { numerator: 4, denominator: 4 },
      trackName: 'DroppedDrums',
      channel: 9,
    });
    const file = new File(
      [Uint8Array.from(midiBytes)],
      'dropped.mid',
      { type: 'audio/midi' },
    );

    await processTrackLaneFileDrop({
      file,
      trackType: 'strudel',
      trackId: track.id,
      startTime: 0,
      wantsQuickSampler: false,
      importAudioFileAsSampler: vi.fn(),
      importAudioFileAsNewQuickSampler: vi.fn(),
      importAudioToTrack: vi.fn(),
      importMidiFile: vi.fn(),
      convertMidiFileToStrudel: vi.fn(async (droppedFile: File) => {
        converted = await store.convertMidiFileToStrudel(droppedFile);
        return converted;
      }),
      applyStrudelCodeToTrack: vi.fn(async (...args) => {
        applied = await store.applyStrudelCodeToTrack(...args);
        return applied;
      }),
      setOpenStrudelEditor: ui.setOpenStrudelEditor,
    });

    expect(converted).not.toBeNull();
    expect(applied).not.toBeNull();
    expect(applied?.trackId).toBe(track.id);

    const updatedTrack = useProjectStore.getState().project!.tracks.find((candidate) => candidate.id === applied!.trackId);
    expect(updatedTrack?.strudelCode).toContain('const BPM = 128');
    expect(updatedTrack?.strudelCode).toContain('stack(');
    expect(updatedTrack?.strudelCode).toMatch(/bd|sd|hh/);
    expect(useUIStore.getState().openStrudelEditorTrackId).toBe(track.id);
    expect(useUIStore.getState().strudelPanelOpen).toBe(true);
  });
});
