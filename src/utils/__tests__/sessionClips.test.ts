import { describe, it, expect } from 'vitest';
import { isPlayableClip, getSessionClips } from '../sessionClips';
import type { Clip, Track } from '../../types/project';

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: overrides.id ?? 'clip-1',
    trackId: overrides.trackId ?? 'track-1',
    startTime: overrides.startTime ?? 0,
    duration: overrides.duration ?? 4,
    prompt: overrides.prompt ?? '',
    lyrics: overrides.lyrics ?? '',
    generationStatus: overrides.generationStatus ?? 'idle',
    generationJobId: overrides.generationJobId ?? null,
    cumulativeMixKey: overrides.cumulativeMixKey ?? null,
    isolatedAudioKey: overrides.isolatedAudioKey ?? null,
    waveformPeaks: overrides.waveformPeaks ?? null,
    midiData: overrides.midiData,
  } as Clip;
}

function makeTrack(clips: Clip[], overrides: Partial<Track> = {}): Track {
  return {
    id: overrides.id ?? 'track-1',
    trackName: 'vocals',
    displayName: 'Vocals',
    color: '#ff0000',
    clips,
    ...overrides,
  } as Track;
}

describe('isPlayableClip', () => {
  it('returns true for clip with generationStatus "ready"', () => {
    const clip = makeClip({ generationStatus: 'ready' });
    expect(isPlayableClip(clip)).toBe(true);
  });

  it('returns true for clip with MIDI notes', () => {
    const clip = makeClip({
      generationStatus: 'idle',
      midiData: { notes: [{ pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 }] } as Clip['midiData'],
    });
    expect(isPlayableClip(clip)).toBe(true);
  });

  it('returns false for idle clip without MIDI data', () => {
    const clip = makeClip({ generationStatus: 'idle' });
    expect(isPlayableClip(clip)).toBe(false);
  });

  it('returns false for idle clip with empty MIDI notes', () => {
    const clip = makeClip({
      generationStatus: 'idle',
      midiData: { notes: [] } as unknown as Clip['midiData'],
    });
    expect(isPlayableClip(clip)).toBe(false);
  });

  it('returns false for generating clip without MIDI', () => {
    const clip = makeClip({ generationStatus: 'generating' });
    expect(isPlayableClip(clip)).toBe(false);
  });

  it('returns false for error clip without MIDI', () => {
    const clip = makeClip({ generationStatus: 'error' });
    expect(isPlayableClip(clip)).toBe(false);
  });
});

describe('getSessionClips', () => {
  it('returns empty array for track with no clips', () => {
    const track = makeTrack([]);
    expect(getSessionClips(track)).toEqual([]);
  });

  it('filters out non-playable clips', () => {
    const playable = makeClip({ id: 'c1', generationStatus: 'ready', startTime: 0 });
    const idle = makeClip({ id: 'c2', generationStatus: 'idle', startTime: 4 });
    const track = makeTrack([playable, idle]);

    const result = getSessionClips(track);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('c1');
  });

  it('sorts clips by startTime ascending', () => {
    const c1 = makeClip({ id: 'c1', generationStatus: 'ready', startTime: 8 });
    const c2 = makeClip({ id: 'c2', generationStatus: 'ready', startTime: 0 });
    const c3 = makeClip({ id: 'c3', generationStatus: 'ready', startTime: 4 });
    const track = makeTrack([c1, c2, c3]);

    const result = getSessionClips(track);
    expect(result.map((c) => c.id)).toEqual(['c2', 'c3', 'c1']);
  });

  it('does not mutate the original track clips array', () => {
    const c1 = makeClip({ id: 'c1', generationStatus: 'ready', startTime: 8 });
    const c2 = makeClip({ id: 'c2', generationStatus: 'ready', startTime: 0 });
    const track = makeTrack([c1, c2]);
    const originalOrder = track.clips.map((c) => c.id);

    getSessionClips(track);
    expect(track.clips.map((c) => c.id)).toEqual(originalOrder);
  });

  it('includes MIDI clips without audio', () => {
    const midiClip = makeClip({
      id: 'midi-1',
      generationStatus: 'idle',
      startTime: 2,
      midiData: { notes: [{ pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 }] } as Clip['midiData'],
    });
    const track = makeTrack([midiClip]);
    const result = getSessionClips(track);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('midi-1');
  });
});
