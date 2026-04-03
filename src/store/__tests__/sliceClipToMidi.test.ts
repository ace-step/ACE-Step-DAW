import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('sliceClipToMidi', () => {
  let clipId: string;
  let trackId: string;

  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    const track = useProjectStore.getState().addTrack('sample');
    trackId = track.id;
    const clip = useProjectStore.getState().addClip(trackId, {
      startTime: 0,
      duration: 4,
      prompt: '',
      lyrics: '',
      audioDuration: 4,
      audioOffset: 0,
      sampleMode: true,
    });
    clipId = clip.id;
    useProjectStore.getState().updateClip(clipId, {
      generationStatus: 'ready',
      isolatedAudioKey: 'sample-audio-key',
      waveformPeaks: [0.1, 0.2, 0.3, 0.4],
    });
  });

  it('creates MIDI notes from slice points', () => {
    // Slice points at sample positions (assuming 44100 sample rate, 4s duration)
    // Convert to seconds: 0.5s, 1.5s, 3.0s
    const slicePoints = [22050, 66150, 132300];
    useProjectStore.getState().sliceClipToMidi(clipId, slicePoints, 44100);

    const clip = useProjectStore
      .getState()
      .project!.tracks.find((t) => t.id === trackId)!
      .clips.find((c) => c.id === clipId)!;

    expect(clip.midiData).not.toBeUndefined();
    // 4 slices: [0, 0.5), [0.5, 1.5), [1.5, 3.0), [3.0, 4.0)
    expect(clip.midiData!.notes).toHaveLength(4);
  });

  it('creates first slice from time 0 to first slice point', () => {
    const slicePoints = [22050]; // 0.5s at 44100 Hz
    useProjectStore.getState().sliceClipToMidi(clipId, slicePoints, 44100);

    const clip = useProjectStore
      .getState()
      .project!.tracks.find((t) => t.id === trackId)!
      .clips.find((c) => c.id === clipId)!;

    const notes = clip.midiData!.notes;
    expect(notes).toHaveLength(2);
    // First note starts at beat 0
    expect(notes[0].startBeat).toBe(0);
    // Duration should reflect the time up to the first slice point
    expect(notes[0].durationBeats).toBeGreaterThan(0);
  });

  it('assigns ascending MIDI pitches starting from C3 (48)', () => {
    const slicePoints = [22050, 44100];
    useProjectStore.getState().sliceClipToMidi(clipId, slicePoints, 44100);

    const clip = useProjectStore
      .getState()
      .project!.tracks.find((t) => t.id === trackId)!
      .clips.find((c) => c.id === clipId)!;

    const notes = clip.midiData!.notes;
    expect(notes[0].pitch).toBe(48); // C3
    expect(notes[1].pitch).toBe(49); // C#3
    expect(notes[2].pitch).toBe(50); // D3
  });

  it('sets velocity to 0.8 for all slice notes', () => {
    const slicePoints = [22050];
    useProjectStore.getState().sliceClipToMidi(clipId, slicePoints, 44100);

    const clip = useProjectStore
      .getState()
      .project!.tracks.find((t) => t.id === trackId)!
      .clips.find((c) => c.id === clipId)!;

    for (const note of clip.midiData!.notes) {
      expect(note.velocity).toBe(0.8);
    }
  });

  it('handles empty slice points — creates single note spanning entire clip', () => {
    useProjectStore.getState().sliceClipToMidi(clipId, [], 44100);

    const clip = useProjectStore
      .getState()
      .project!.tracks.find((t) => t.id === trackId)!
      .clips.find((c) => c.id === clipId)!;

    expect(clip.midiData).not.toBeUndefined();
    expect(clip.midiData!.notes).toHaveLength(1);
    expect(clip.midiData!.notes[0].startBeat).toBe(0);
  });

  it('does nothing for non-existent clip', () => {
    // Should not throw
    useProjectStore.getState().sliceClipToMidi('non-existent', [22050], 44100);
    // State should be unchanged
    const clip = useProjectStore
      .getState()
      .project!.tracks.find((t) => t.id === trackId)!
      .clips.find((c) => c.id === clipId)!;

    expect(clip.midiData).toBeUndefined();
  });

  it('each note has a unique id', () => {
    const slicePoints = [22050, 44100, 66150];
    useProjectStore.getState().sliceClipToMidi(clipId, slicePoints, 44100);

    const clip = useProjectStore
      .getState()
      .project!.tracks.find((t) => t.id === trackId)!
      .clips.find((c) => c.id === clipId)!;

    const ids = clip.midiData!.notes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
