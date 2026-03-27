import { describe, it, expect } from 'vitest';
import { stripHeavyDataForPersist } from '../projectPersistUtils';
import type { Project, Clip, Track, ClipVersion, Take, AssetClip } from '../../types/project';

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'clip-1',
    trackId: 'track-1',
    startBeat: 0,
    durationBeats: 4,
    totalDuration: 2,
    prompt: 'test',
    generationStatus: 'ready',
    generationJobId: null,
    cumulativeMixKey: null,
    isolatedAudioKey: 'audio-key',
    waveformPeaks: [0.1, 0.2, 0.3, 0.4, 0.5],
    ...overrides,
  } as Clip;
}

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    type: 'stems',
    displayName: 'Track 1',
    clips: [makeClip()],
    ...overrides,
  } as Track;
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: 'Test Project',
    createdAt: 1000,
    updatedAt: 2000,
    bpm: 120,
    keyScale: 'C major',
    timeSignature: 4,
    totalDuration: 60,
    tracks: [makeTrack()],
    generationDefaults: {} as Project['generationDefaults'],
    ...overrides,
  } as Project;
}

describe('stripHeavyDataForPersist', () => {
  it('nullifies waveformPeaks in all clips', () => {
    const project = makeProject({
      tracks: [
        makeTrack({
          clips: [
            makeClip({ waveformPeaks: [0.1, 0.2, 0.3] }),
            makeClip({ id: 'clip-2', waveformPeaks: [0.4, 0.5, 0.6] }),
          ],
        }),
        makeTrack({
          id: 'track-2',
          clips: [makeClip({ id: 'clip-3', waveformPeaks: [0.7, 0.8] })],
        }),
      ],
    });

    const stripped = stripHeavyDataForPersist(project);

    for (const track of stripped.tracks) {
      for (const clip of track.clips) {
        expect(clip.waveformPeaks).toBeNull();
      }
    }
  });

  it('preserves all non-heavy project fields', () => {
    const project = makeProject();
    const stripped = stripHeavyDataForPersist(project);

    expect(stripped.id).toBe(project.id);
    expect(stripped.name).toBe(project.name);
    expect(stripped.bpm).toBe(project.bpm);
    expect(stripped.tracks.length).toBe(project.tracks.length);
    expect(stripped.tracks[0].clips[0].prompt).toBe('test');
    expect(stripped.tracks[0].clips[0].isolatedAudioKey).toBe('audio-key');
  });

  it('does not mutate the original project', () => {
    const project = makeProject();
    const originalPeaks = project.tracks[0].clips[0].waveformPeaks;
    stripHeavyDataForPersist(project);

    expect(project.tracks[0].clips[0].waveformPeaks).toBe(originalPeaks);
  });

  it('handles project with no tracks', () => {
    const project = makeProject({ tracks: [] });
    const stripped = stripHeavyDataForPersist(project);
    expect(stripped.tracks).toEqual([]);
  });

  it('handles clips with null waveformPeaks', () => {
    const project = makeProject({
      tracks: [makeTrack({ clips: [makeClip({ waveformPeaks: null })] })],
    });
    const stripped = stripHeavyDataForPersist(project);
    expect(stripped.tracks[0].clips[0].waveformPeaks).toBeNull();
  });

  it('nullifies waveformPeaks in clip versions', () => {
    const versions: ClipVersion[] = [
      { id: 'v1', cumulativeMixKey: null, isolatedAudioKey: 'k1', waveformPeaks: [0.1, 0.2], generatedAt: 1000 },
      { id: 'v2', cumulativeMixKey: null, isolatedAudioKey: 'k2', waveformPeaks: [0.3, 0.4], generatedAt: 2000 },
    ];
    const project = makeProject({
      tracks: [makeTrack({ clips: [makeClip({ versions })] })],
    });

    const stripped = stripHeavyDataForPersist(project);
    for (const v of stripped.tracks[0].clips[0].versions!) {
      expect(v.waveformPeaks).toBeNull();
    }
    // Original not mutated
    expect(project.tracks[0].clips[0].versions![0].waveformPeaks).toEqual([0.1, 0.2]);
  });

  it('nullifies waveformPeaks in clip takes', () => {
    const takes: Take[] = [
      { id: 't1', audioKey: 'a1', selected: true, waveformPeaks: [0.5, 0.6] },
    ];
    const project = makeProject({
      tracks: [makeTrack({ clips: [makeClip({ takes })] })],
    });

    const stripped = stripHeavyDataForPersist(project);
    expect(stripped.tracks[0].clips[0].takes![0].waveformPeaks).toBeNull();
    // Original not mutated
    expect(project.tracks[0].clips[0].takes![0].waveformPeaks).toEqual([0.5, 0.6]);
  });

  it('nullifies waveformPeaks in project assets and their originClipSnapshot', () => {
    const assets = [
      {
        id: 'a1',
        clipId: 'c1',
        trackDisplayName: 'T1',
        prompt: 'test',
        source: 'generated' as const,
        isolatedAudioKey: 'k1',
        cumulativeMixKey: null,
        waveformPeaks: [0.7, 0.8],
        starred: false,
        createdAt: 1000,
        duration: 5,
        originClipSnapshot: {
          waveformPeaks: [0.9, 1.0],
        },
      },
    ] as AssetClip[];

    const project = makeProject({ assets });
    const stripped = stripHeavyDataForPersist(project);

    expect(stripped.assets![0].waveformPeaks).toBeNull();
    expect(stripped.assets![0].originClipSnapshot!.waveformPeaks).toBeNull();
    // Original not mutated
    expect(project.assets![0].waveformPeaks).toEqual([0.7, 0.8]);
  });
});
