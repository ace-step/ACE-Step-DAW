import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MidiCaptureService } from '../../src/services/midiCaptureService';
import { useProjectStore } from '../../src/store/projectStore';
import { useTransportStore } from '../../src/store/transportStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('MidiCaptureService', () => {
  let service: MidiCaptureService;

  beforeEach(() => {
    service = new MidiCaptureService(60);
  });

  it('records noteOn events into the buffer', () => {
    service.noteOn('track-1', 60, 0.8, 1.0);
    expect(service.hasEvents('track-1')).toBe(true);
    expect(service.getBuffer('track-1')).toHaveLength(1);
    expect(service.getBuffer('track-1')[0]).toMatchObject({
      pitch: 60,
      velocity: 0.8,
      timeOn: 1.0,
      timeOff: 0,
    });
  });

  it('completes notes on noteOff', () => {
    service.noteOn('track-1', 60, 0.8, 1.0);
    service.noteOff('track-1', 60, 1.5);
    expect(service.getBuffer('track-1')[0].timeOff).toBe(1.5);
  });

  it('returns false for hasEvents on empty track', () => {
    expect(service.hasEvents('nonexistent')).toBe(false);
  });

  it('prunes old events beyond maxBufferDuration', () => {
    service.noteOn('track-1', 60, 0.8, 0);
    service.noteOff('track-1', 60, 0.5);
    service.noteOn('track-1', 64, 0.8, 70);
    service.noteOff('track-1', 64, 70.5);

    service.prune(70);
    const buf = service.getBuffer('track-1');
    // Only the event at t=70 should survive (maxBuffer=60s, cutoff=10)
    expect(buf).toHaveLength(1);
    expect(buf[0].pitch).toBe(64);
  });

  it('drains last N bars into beat-relative notes', () => {
    const bpm = 120;
    const timeSig = 4;
    const secPerBeat = 60 / bpm; // 0.5s
    const barDuration = timeSig * secPerBeat; // 2s

    // Play a note at bar 3, beat 1 (time = 4.0s)
    service.noteOn('track-1', 60, 0.9, 4.0);
    service.noteOff('track-1', 60, 4.5);

    const result = service.drain('track-1', 6.0, bpm, timeSig, 4);
    expect(result).not.toBeNull();
    expect(result!.notes).toHaveLength(1);
    expect(result!.notes[0].pitch).toBe(60);
    expect(result!.notes[0].velocity).toBe(0.9);
    // Note should be at beat offset relative to clip start
    expect(result!.notes[0].durationBeats).toBeCloseTo(1.0, 1);
    expect(result!.clipDuration).toBe(8.0); // 4 bars * 2s/bar
  });

  it('drain returns null when buffer is empty', () => {
    const result = service.drain('track-1', 10, 120, 4, 4);
    expect(result).toBeNull();
  });

  it('drain clears the buffer after extraction', () => {
    service.noteOn('track-1', 60, 0.8, 1.0);
    service.noteOff('track-1', 60, 1.5);
    service.drain('track-1', 2.0, 120, 4, 4);
    expect(service.hasEvents('track-1')).toBe(false);
  });

  it('closes held notes at capture time during drain', () => {
    service.noteOn('track-1', 60, 0.8, 1.0);
    // Note is still held (no noteOff)
    const result = service.drain('track-1', 3.0, 120, 4, 4);
    expect(result).not.toBeNull();
    expect(result!.notes).toHaveLength(1);
    // Duration should extend from noteOn to captureTime
    expect(result!.notes[0].durationBeats).toBeGreaterThan(0);
  });

  it('getActiveTrackIds returns only tracks with events', () => {
    service.noteOn('track-1', 60, 0.8, 1.0);
    service.noteOn('track-2', 64, 0.7, 1.0);
    expect(service.getActiveTrackIds()).toContain('track-1');
    expect(service.getActiveTrackIds()).toContain('track-2');
    expect(service.getActiveTrackIds()).not.toContain('track-3');
  });

  it('clearTrack removes only the specified track buffer', () => {
    service.noteOn('track-1', 60, 0.8, 1.0);
    service.noteOn('track-2', 64, 0.7, 1.0);
    service.clearTrack('track-1');
    expect(service.hasEvents('track-1')).toBe(false);
    expect(service.hasEvents('track-2')).toBe(true);
  });

  it('clearAll removes all buffers', () => {
    service.noteOn('track-1', 60, 0.8, 1.0);
    service.noteOn('track-2', 64, 0.7, 1.0);
    service.clearAll();
    expect(service.getActiveTrackIds()).toHaveLength(0);
  });
});

describe('captureMidi integration (#1034)', () => {
  beforeEach(() => {
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
  });

  it('captures MIDI buffer into a new clip on the track', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('midi');

    const captureService = new MidiCaptureService();
    captureService.noteOn(track.id, 60, 0.8, 1.0);
    captureService.noteOff(track.id, 60, 1.5);
    captureService.noteOn(track.id, 64, 0.7, 2.0);
    captureService.noteOff(track.id, 64, 2.5);

    const clipId = useProjectStore.getState().captureMidi(track.id, 4.0, captureService);
    expect(clipId).toBeDefined();

    const project = useProjectStore.getState().project;
    const updatedTrack = project?.tracks.find((t) => t.id === track.id);
    const capturedClip = updatedTrack?.clips.find((c) => c.id === clipId);
    expect(capturedClip).toBeDefined();
    expect(capturedClip!.midiData?.notes).toHaveLength(2);
    expect(capturedClip!.prompt).toBe('Captured MIDI');
    expect(capturedClip!.source).toBe('uploaded');
  });

  it('captured clip is auto-assigned to a session slot', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('midi');

    const captureService = new MidiCaptureService();
    captureService.noteOn(track.id, 60, 0.8, 1.0);
    captureService.noteOff(track.id, 60, 1.5);

    const clipId = useProjectStore.getState().captureMidi(track.id, 4.0, captureService);
    expect(clipId).toBeDefined();

    const session = useProjectStore.getState().project?.session;
    expect(session).toBeDefined();
    const slot = session!.slots.find((s) => s.trackId === track.id && s.clipId === clipId);
    expect(slot).toBeDefined();
  });

  it('returns undefined when track has no buffered MIDI', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('midi');

    const captureService = new MidiCaptureService();
    const clipId = useProjectStore.getState().captureMidi(track.id, 4.0, captureService);
    expect(clipId).toBeUndefined();
  });

  it('supports configurable bar count', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('midi');

    const captureService = new MidiCaptureService();
    // Notes spread over a wide time range
    captureService.noteOn(track.id, 60, 0.8, 0.5);
    captureService.noteOff(track.id, 60, 1.0);
    captureService.noteOn(track.id, 64, 0.7, 15.0);
    captureService.noteOff(track.id, 64, 15.5);

    // Capture only last 2 bars (= 4s at 120BPM, 4/4)
    const clipId = useProjectStore.getState().captureMidi(track.id, 16.0, captureService, { bars: 2 });
    expect(clipId).toBeDefined();

    const project = useProjectStore.getState().project;
    const clip = project?.tracks.find((t) => t.id === track.id)?.clips.find((c) => c.id === clipId);
    expect(clip).toBeDefined();
    // Only the note at t=15 should be within the last 2 bars
    expect(clip!.midiData?.notes).toHaveLength(1);
    expect(clip!.midiData?.notes[0].pitch).toBe(64);
  });
});
