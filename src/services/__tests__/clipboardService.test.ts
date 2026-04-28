import { describe, it, expect } from 'vitest';
import {
  copyClips,
  copyNotes,
  preparePasteClips,
  preparePasteNotes,
  deepCloneClip,
  deepCloneMidiNote,
  type ClipboardClipData,
  type ClipboardNoteData,
} from '../clipboardService';
import type { Clip, MidiNote } from '../../types/project';

// ── Fixtures ──────────────────────────────────────────────────────

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'clip-1',
    trackId: 'track-1',
    startTime: 4,
    duration: 8,
    prompt: 'test prompt',
    lyrics: '',
    generationStatus: 'ready',
    generationJobId: null,
    cumulativeMixKey: 'cum-key',
    isolatedAudioKey: 'iso-key',
    waveformPeaks: [0.1, 0.5, 0.8],
    ...overrides,
  };
}

function makeNote(overrides: Partial<MidiNote> = {}): MidiNote {
  return {
    id: 'note-1',
    pitch: 60,
    startBeat: 0,
    durationBeats: 1,
    velocity: 100,
    ...overrides,
  };
}

// ── deepCloneClip ─────────────────────────────────────────────────

describe('deepCloneClip', () => {
  it('creates an independent copy of a clip', () => {
    const original = makeClip({ waveformPeaks: [0.1, 0.2] });
    const clone = deepCloneClip(original);

    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    // Mutating clone must not affect original
    clone.startTime = 999;
    expect(original.startTime).toBe(4);
  });

  it('deep clones midiData notes', () => {
    const original = makeClip({
      midiData: { notes: [makeNote()], grid: '1/16' },
    });
    const clone = deepCloneClip(original);

    expect(clone.midiData!.notes).toEqual(original.midiData!.notes);
    clone.midiData!.notes[0].pitch = 999;
    expect(original.midiData!.notes[0].pitch).toBe(60);
  });
});

// ── deepCloneMidiNote ─────────────────────────────────────────────

describe('deepCloneMidiNote', () => {
  it('creates an independent copy of a note', () => {
    const original = makeNote();
    const clone = deepCloneMidiNote(original);

    expect(clone).toEqual(original);
    clone.pitch = 999;
    expect(original.pitch).toBe(60);
  });
});

// ── copyClips ─────────────────────────────────────────────────────

describe('copyClips', () => {
  it('returns null for empty array', () => {
    expect(copyClips([])).toBeNull();
  });

  it('builds clipboard data from a single clip', () => {
    const clip = makeClip({ startTime: 4 });
    const result = copyClips([{ clip, trackId: 'track-1' }]);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('clips');
    expect(result!.entries).toHaveLength(1);
    expect(result!.entries[0].sourceTrackId).toBe('track-1');
    expect(result!.anchorTime).toBe(4);
    // Should be a deep clone, not the same reference
    expect(result!.entries[0].clip).not.toBe(clip);
    expect(result!.entries[0].clip).toEqual(clip);
  });

  it('computes anchorTime as earliest startTime among multiple clips', () => {
    const clip1 = makeClip({ id: 'c1', startTime: 8 });
    const clip2 = makeClip({ id: 'c2', startTime: 2 });
    const clip3 = makeClip({ id: 'c3', startTime: 12 });

    const result = copyClips([
      { clip: clip1, trackId: 'track-1' },
      { clip: clip2, trackId: 'track-2' },
      { clip: clip3, trackId: 'track-1' },
    ]);

    expect(result!.anchorTime).toBe(2);
    expect(result!.entries).toHaveLength(3);
  });
});

// ── copyNotes ─────────────────────────────────────────────────────

describe('copyNotes', () => {
  it('returns null for empty array', () => {
    expect(copyNotes([], 'clip-1')).toBeNull();
  });

  it('builds clipboard data from notes', () => {
    const notes = [
      makeNote({ id: 'n1', startBeat: 4 }),
      makeNote({ id: 'n2', startBeat: 2 }),
    ];
    const result = copyNotes(notes, 'clip-1');

    expect(result).not.toBeNull();
    expect(result!.type).toBe('notes');
    expect(result!.notes).toHaveLength(2);
    expect(result!.sourceClipId).toBe('clip-1');
    expect(result!.anchorBeat).toBe(2);
    // Deep clones
    expect(result!.notes[0]).not.toBe(notes[0]);
  });
});

// ── preparePasteClips ─────────────────────────────────────────────

describe('preparePasteClips', () => {
  it('offsets clips to paste at the given time', () => {
    const data: ClipboardClipData = {
      type: 'clips',
      entries: [
        { clip: makeClip({ startTime: 4, duration: 4 }), sourceTrackId: 'track-1' },
        { clip: makeClip({ id: 'c2', startTime: 8, duration: 4 }), sourceTrackId: 'track-2' },
      ],
      anchorTime: 4,
    };

    const result = preparePasteClips(data, 16);
    expect(result).toHaveLength(2);

    // Offset = 16 - 4 = 12
    expect(result[0].clip.startTime).toBe(16); // 4 + 12
    expect(result[1].clip.startTime).toBe(20); // 8 + 12
    expect(result[0].targetTrackId).toBe('track-1');
    expect(result[1].targetTrackId).toBe('track-2');
  });

  it('generates new IDs for pasted clips', () => {
    const data: ClipboardClipData = {
      type: 'clips',
      entries: [{ clip: makeClip(), sourceTrackId: 'track-1' }],
      anchorTime: 4,
    };

    const result = preparePasteClips(data, 4);
    expect(result[0].clip.id).not.toBe('clip-1');
    expect(result[0].clip.id.length).toBeGreaterThan(0);
  });

  it('generates new IDs for MIDI notes inside pasted clips', () => {
    const clip = makeClip({
      midiData: { notes: [makeNote({ id: 'original-note' })], grid: '1/16' },
    });
    const data: ClipboardClipData = {
      type: 'clips',
      entries: [{ clip, sourceTrackId: 'track-1' }],
      anchorTime: 4,
    };

    const result = preparePasteClips(data, 4);
    expect(result[0].clip.midiData!.notes[0].id).not.toBe('original-note');
  });

  it('preserves audio state for ready clips', () => {
    const clip = makeClip({
      generationStatus: 'ready',
      isolatedAudioKey: 'audio-key',
      cumulativeMixKey: 'mix-key',
      waveformPeaks: [0.1, 0.5],
    });
    const data: ClipboardClipData = {
      type: 'clips',
      entries: [{ clip, sourceTrackId: 'track-1' }],
      anchorTime: 4,
    };

    const result = preparePasteClips(data, 10);
    expect(result[0].clip.generationStatus).toBe('ready');
    expect(result[0].clip.isolatedAudioKey).toBe('audio-key');
    expect(result[0].clip.cumulativeMixKey).toBe('mix-key');
    expect(result[0].clip.waveformPeaks).toEqual([0.1, 0.5]);
  });

  it('clears generationJobId on pasted clips', () => {
    const clip = makeClip({ generationJobId: 'running-job' });
    const data: ClipboardClipData = {
      type: 'clips',
      entries: [{ clip, sourceTrackId: 'track-1' }],
      anchorTime: 4,
    };

    const result = preparePasteClips(data, 4);
    expect(result[0].clip.generationJobId).toBeNull();
  });
});

// ── preparePasteNotes ─────────────────────────────────────────────

describe('preparePasteNotes', () => {
  it('offsets notes to paste at the given beat', () => {
    const data: ClipboardNoteData = {
      type: 'notes',
      notes: [
        makeNote({ startBeat: 2 }),
        makeNote({ id: 'n2', startBeat: 6 }),
      ],
      sourceClipId: 'clip-1',
      anchorBeat: 2,
    };

    const result = preparePasteNotes(data, 8);
    // Offset = 8 - 2 = 6
    expect(result[0].startBeat).toBe(8); // 2 + 6
    expect(result[1].startBeat).toBe(12); // 6 + 6
  });

  it('generates new IDs for pasted notes', () => {
    const data: ClipboardNoteData = {
      type: 'notes',
      notes: [makeNote({ id: 'original' })],
      sourceClipId: 'clip-1',
      anchorBeat: 0,
    };

    const result = preparePasteNotes(data, 0);
    expect(result[0].id).not.toBe('original');
    expect(result[0].id.length).toBeGreaterThan(0);
  });

  it('preserves pitch, duration, and velocity', () => {
    const data: ClipboardNoteData = {
      type: 'notes',
      notes: [makeNote({ pitch: 72, durationBeats: 2, velocity: 64 })],
      sourceClipId: 'clip-1',
      anchorBeat: 0,
    };

    const result = preparePasteNotes(data, 4);
    expect(result[0].pitch).toBe(72);
    expect(result[0].durationBeats).toBe(2);
    expect(result[0].velocity).toBe(64);
  });
});
