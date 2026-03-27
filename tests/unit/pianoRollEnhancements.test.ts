import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../src/hooks/useToast', () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../src/hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    ctx: {
      createBuffer: vi.fn((channels: number, length: number, sampleRate: number) => ({
        numberOfChannels: channels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: () => new Float32Array(length),
      })),
    },
    decodeAudioData: vi.fn(),
  }),
}));

function setupClipWithNote(opts: {
  pitch?: number;
  startBeat?: number;
  durationBeats?: number;
  velocity?: number;
} = {}) {
  useProjectStore.getState().createProject();
  const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
  const clip = useProjectStore.getState().ensureMidiClip(track.id);
  const noteId = useProjectStore.getState().addMidiNote(clip.id, {
    pitch: opts.pitch ?? 60,
    startBeat: opts.startBeat ?? 0,
    durationBeats: opts.durationBeats ?? 1,
    velocity: opts.velocity ?? 100,
  })!;
  return { track, clip, noteId };
}

function getNote(noteId: string) {
  const project = useProjectStore.getState().project!;
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      const note = clip.midiData?.notes.find((n) => n.id === noteId);
      if (note) return note;
    }
  }
  return undefined;
}

// ─── Ghost Notes (uiStore) ──────────────────────────────────────────────────

describe('Ghost notes toggle in uiStore', () => {
  beforeEach(() => {
    useUIStore.setState({ showGhostNotes: false });
  });

  it('defaults showGhostNotes to false', () => {
    expect(useUIStore.getState().showGhostNotes).toBe(false);
  });

  it('toggles showGhostNotes via toggleGhostNotes', () => {
    useUIStore.getState().toggleGhostNotes();
    expect(useUIStore.getState().showGhostNotes).toBe(true);
    useUIStore.getState().toggleGhostNotes();
    expect(useUIStore.getState().showGhostNotes).toBe(false);
  });

  it('sets showGhostNotes directly', () => {
    useUIStore.getState().setShowGhostNotes(true);
    expect(useUIStore.getState().showGhostNotes).toBe(true);
    useUIStore.getState().setShowGhostNotes(false);
    expect(useUIStore.getState().showGhostNotes).toBe(false);
  });
});

// ─── setNoteVelocity (projectStore) ─────────────────────────────────────────

describe('setNoteVelocity', () => {
  beforeEach(() => {
    useProjectStore.getState().createProject();
  });

  it('sets the velocity of a specific note', () => {
    const { clip, noteId } = setupClipWithNote({ velocity: 100 });
    useProjectStore.getState().setNoteVelocity(clip.id, noteId, 42);
    const note = getNote(noteId);
    expect(note?.velocity).toBe(42);
  });

  it('clamps velocity to 1–127 range', () => {
    const { clip, noteId } = setupClipWithNote({ velocity: 100 });
    useProjectStore.getState().setNoteVelocity(clip.id, noteId, 0);
    expect(getNote(noteId)?.velocity).toBe(1);

    useProjectStore.getState().setNoteVelocity(clip.id, noteId, 200);
    expect(getNote(noteId)?.velocity).toBe(127);
  });

  it('does nothing for a non-existent note', () => {
    const { clip, noteId } = setupClipWithNote({ velocity: 80 });
    useProjectStore.getState().setNoteVelocity(clip.id, 'nonexistent', 50);
    expect(getNote(noteId)?.velocity).toBe(80);
  });

  it('does nothing for a non-existent clip', () => {
    const { noteId } = setupClipWithNote({ velocity: 80 });
    useProjectStore.getState().setNoteVelocity('nonexistent-clip', noteId, 50);
    expect(getNote(noteId)?.velocity).toBe(80);
  });
});

// ─── Velocity paint tool mode (uiStore) ─────────────────────────────────────

describe('Velocity paint tool mode in uiStore', () => {
  beforeEach(() => {
    useUIStore.setState({ activePianoRollTool: 'select' });
  });

  it('can set activePianoRollTool to velocityPaint', () => {
    useUIStore.getState().setActivePianoRollTool('velocityPaint');
    expect(useUIStore.getState().activePianoRollTool).toBe('velocityPaint');
  });

  it('velocityPaint is a valid tool mode', () => {
    useUIStore.getState().setActivePianoRollTool('velocityPaint');
    expect(useUIStore.getState().activePianoRollTool).toBe('velocityPaint');
    // Can switch back
    useUIStore.getState().setActivePianoRollTool('select');
    expect(useUIStore.getState().activePianoRollTool).toBe('select');
  });
});

// ─── Chord stamp (already exists, verify integration) ───────────────────────

describe('Chord stamp via stampChord store action', () => {
  beforeEach(() => {
    useProjectStore.getState().createProject();
  });

  it('stamps a major chord (3 notes) at root pitch', () => {
    const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
    const clip = useProjectStore.getState().ensureMidiClip(track.id);
    const noteIds = useProjectStore.getState().stampChord(
      clip.id,
      60,         // root = C4
      [0, 4, 7],  // major intervals
      0,           // startBeat
      1,           // durationBeats
      100,         // velocity
    );
    expect(noteIds).toHaveLength(3);

    const project = useProjectStore.getState().project!;
    const updatedClip = project.tracks
      .flatMap((t) => t.clips)
      .find((c) => c.id === clip.id)!;
    const notes = updatedClip.midiData!.notes;
    expect(notes).toHaveLength(3);
    expect(notes.map((n) => n.pitch).sort((a, b) => a - b)).toEqual([60, 64, 67]);
    expect(notes.every((n) => n.startBeat === 0)).toBe(true);
    expect(notes.every((n) => n.durationBeats === 1)).toBe(true);
    expect(notes.every((n) => n.velocity === 100)).toBe(true);
  });

  it('stamps a minor 7th chord (4 notes)', () => {
    const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
    const clip = useProjectStore.getState().ensureMidiClip(track.id);
    const noteIds = useProjectStore.getState().stampChord(
      clip.id,
      60,
      [0, 3, 7, 10], // minor 7th
      2,
      0.5,
      90,
    );
    expect(noteIds).toHaveLength(4);

    const project = useProjectStore.getState().project!;
    const updatedClip = project.tracks
      .flatMap((t) => t.clips)
      .find((c) => c.id === clip.id)!;
    const notes = updatedClip.midiData!.notes;
    expect(notes.map((n) => n.pitch).sort((a, b) => a - b)).toEqual([60, 63, 67, 70]);
  });
});
