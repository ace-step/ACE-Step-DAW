import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MidiCaptureService } from '../../src/services/midiCaptureService';
import { useProjectStore } from '../../src/store/projectStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../src/services/audioFileManager', () => ({
  loadAudioBlobByKey: vi.fn(),
  saveAudioBlob: vi.fn(),
}));

vi.mock('../../src/hooks/useToast', () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../src/hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    ctx: {
      createBuffer: vi.fn(),
    },
    decodeAudioData: vi.fn(),
  }),
}));

// ── MidiCaptureService unit tests ─────────────────────────────────────────

describe('MidiCaptureService', () => {
  let service: MidiCaptureService;

  beforeEach(() => {
    service = new MidiCaptureService(60); // 60s buffer for tests
  });

  it('records noteOn events into the buffer', () => {
    service.noteOn('track-1', 60, 0.8, 1.0);
    expect(service.hasEvents('track-1')).toBe(true);
    expect(service.getBuffer('track-1')).toHaveLength(1);
    expect(service.getBuffer('track-1')[0]).toEqual({
      pitch: 60, velocity: 0.8, timeOn: 1.0, timeOff: 0,
    });
  });

  it('completes events on noteOff', () => {
    service.noteOn('track-1', 60, 0.8, 1.0);
    service.noteOff('track-1', 60, 2.0);
    const events = service.getBuffer('track-1');
    expect(events[0].timeOff).toBe(2.0);
  });

  it('returns false for tracks with no events', () => {
    expect(service.hasEvents('nonexistent')).toBe(false);
  });

  it('prunes events older than maxBufferDuration', () => {
    service.noteOn('track-1', 60, 0.8, 1.0);
    service.noteOff('track-1', 60, 2.0);
    service.noteOn('track-1', 64, 0.9, 50.0);
    service.noteOff('track-1', 64, 51.0);
    // Prune at t=70 with 60s buffer: cutoff=10 → first event (ends at t=2) removed
    service.prune(70);
    expect(service.getBuffer('track-1')).toHaveLength(1);
    expect(service.getBuffer('track-1')[0].pitch).toBe(64);
  });

  it('drains buffer into beat-relative notes', () => {
    // BPM=120, timeSig=4 → 1 beat = 0.5s, 1 bar = 2s
    // Play a note at t=8.0 to t=8.5 (1 beat)
    service.noteOn('track-1', 60, 0.8, 8.0);
    service.noteOff('track-1', 60, 8.5);

    const result = service.drain('track-1', 10, 120, 4, 2);
    expect(result).not.toBeNull();
    // 2 bars = 4s before t=10 → captureStart=6, snaps to bar at 6s
    expect(result!.clipStartTime).toBe(6);
    expect(result!.clipDuration).toBe(4);
    expect(result!.notes).toHaveLength(1);
    // Note at t=8.0, clip starts at t=6 → startBeat = (8-6)/0.5 = 4
    expect(result!.notes[0].startBeat).toBe(4);
    expect(result!.notes[0].durationBeats).toBe(1);
    expect(result!.notes[0].pitch).toBe(60);
    expect(result!.notes[0].velocity).toBe(0.8);
  });

  it('closes held notes at capture time during drain', () => {
    service.noteOn('track-1', 60, 0.8, 5.0);
    // No noteOff — note still held
    const result = service.drain('track-1', 8, 120, 4, 2);
    expect(result).not.toBeNull();
    // Note should be closed at captureTime=8
    expect(result!.notes).toHaveLength(1);
    expect(result!.notes[0].durationBeats).toBeGreaterThan(0);
  });

  it('returns null when buffer is empty', () => {
    expect(service.drain('track-1', 10, 120, 4, 2)).toBeNull();
  });

  it('returns null when no notes fall within capture window', () => {
    service.noteOn('track-1', 60, 0.8, 1.0);
    service.noteOff('track-1', 60, 1.5);
    // Capture window: t=8..12 → note at t=1..1.5 is outside
    expect(service.drain('track-1', 12, 120, 4, 2)).toBeNull();
  });

  it('clears buffer after drain', () => {
    service.noteOn('track-1', 60, 0.8, 8.0);
    service.noteOff('track-1', 60, 8.5);
    service.drain('track-1', 10, 120, 4, 2);
    expect(service.hasEvents('track-1')).toBe(false);
  });

  it('clears track-specific buffers', () => {
    service.noteOn('track-1', 60, 0.8, 1.0);
    service.noteOn('track-2', 64, 0.9, 1.0);
    service.clearTrack('track-1');
    expect(service.hasEvents('track-1')).toBe(false);
    expect(service.hasEvents('track-2')).toBe(true);
  });

  it('clears all buffers', () => {
    service.noteOn('track-1', 60, 0.8, 1.0);
    service.noteOn('track-2', 64, 0.9, 1.0);
    service.clearAll();
    expect(service.getActiveTrackIds()).toEqual([]);
  });

  it('returns active track IDs', () => {
    service.noteOn('track-1', 60, 0.8, 1.0);
    service.noteOn('track-2', 64, 0.9, 1.0);
    expect(service.getActiveTrackIds().sort()).toEqual(['track-1', 'track-2']);
  });
});

// ── captureMidi store action tests ────────────────────────────────────────

describe('captureMidi store action', () => {
  beforeEach(() => {
    useProjectStore.getState().createProject({ bpm: 120 });
  });

  it('creates a MIDI clip from captured buffer on a pianoRoll track', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('keyboard', 'pianoRoll');

    // Feed events into the capture service
    const captureService = new MidiCaptureService();
    captureService.noteOn(track.id, 60, 0.8, 8.0);
    captureService.noteOff(track.id, 60, 8.5);
    captureService.noteOn(track.id, 64, 0.7, 9.0);
    captureService.noteOff(track.id, 64, 9.5);

    const clipId = store.captureMidi(track.id, 10, captureService, { bars: 2 });
    expect(clipId).toBeDefined();

    const updatedTrack = useProjectStore.getState().getTrackById(track.id);
    const clip = updatedTrack?.clips.find((c) => c.id === clipId);
    expect(clip).toBeDefined();
    expect(clip!.midiData).toBeDefined();
    expect(clip!.midiData!.notes.length).toBe(2);
  });

  it('returns undefined if buffer is empty', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('keyboard', 'pianoRoll');
    const captureService = new MidiCaptureService();

    const clipId = store.captureMidi(track.id, 10, captureService);
    expect(clipId).toBeUndefined();
  });

  it('supports undo of captured clip', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('keyboard', 'pianoRoll');

    const captureService = new MidiCaptureService();
    captureService.noteOn(track.id, 60, 0.8, 8.0);
    captureService.noteOff(track.id, 60, 8.5);

    store.captureMidi(track.id, 10, captureService, { bars: 2 });
    const clipsAfterCapture = useProjectStore.getState().getTrackById(track.id)?.clips ?? [];
    expect(clipsAfterCapture.length).toBeGreaterThanOrEqual(1);

    useProjectStore.getState().undo();
    const clipsAfterUndo = useProjectStore.getState().getTrackById(track.id)?.clips ?? [];
    // The captured clip should be removed by undo
    expect(clipsAfterUndo.length).toBe(clipsAfterCapture.length - 1);
  });

  it('quantizes notes when quantize option is provided', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('keyboard', 'pianoRoll');

    const captureService = new MidiCaptureService();
    // Note slightly off-grid: at beat 4.1 instead of 4.0
    // t = clipStart + beat * secondsPerBeat
    // At 120 BPM, 1 beat = 0.5s; note at t=8.05 → beat offset ~4.1 from clip start at 6s
    captureService.noteOn(track.id, 60, 0.8, 8.05);
    captureService.noteOff(track.id, 60, 8.55);

    const clipId = store.captureMidi(track.id, 10, captureService, { bars: 2, quantize: '1/4' });
    expect(clipId).toBeDefined();

    const clip = useProjectStore.getState().getClipById(clipId!);
    expect(clip?.midiData?.notes[0].startBeat).toBe(4); // Quantized to nearest quarter note
  });
});
