import { describe, it, expect } from 'vitest';
import { stripHeavyDataForPersist } from '../projectPersistUtils';
import type { Project } from '../../types/project';

function makeMinimalProject(overrides?: Partial<Project>): Project {
  return {
    id: 'proj-1',
    name: 'Test Project',
    bpm: 120,
    timeSignatureNumerator: 4,
    timeSignatureDenominator: 4,
    duration: 60,
    keyScale: 'C major',
    tracks: [],
    assets: [],
    markers: [],
    automationLanes: [],
    ...overrides,
  } as Project;
}

describe('stripHeavyDataForPersist', () => {
  it('returns a project with the same top-level fields', () => {
    const project = makeMinimalProject({ name: 'My Song', bpm: 140 });
    const result = stripHeavyDataForPersist(project);
    expect(result.name).toBe('My Song');
    expect(result.bpm).toBe(140);
    expect(result.id).toBe('proj-1');
  });

  it('nullifies waveformPeaks on clips', () => {
    const project = makeMinimalProject({
      tracks: [
        {
          id: 't1',
          name: 'Track 1',
          type: 'stems',
          clips: [
            {
              id: 'c1',
              start: 0,
              duration: 4,
              waveformPeaks: new Float32Array([0.1, 0.5, 0.9]),
            } as any,
          ],
        } as any,
      ],
    });

    const result = stripHeavyDataForPersist(project);
    expect(result.tracks[0].clips[0].waveformPeaks).toBeNull();
  });

  it('nullifies waveformPeaks on clip versions', () => {
    const project = makeMinimalProject({
      tracks: [
        {
          id: 't1',
          name: 'Track 1',
          type: 'stems',
          clips: [
            {
              id: 'c1',
              start: 0,
              duration: 4,
              waveformPeaks: new Float32Array([0.5]),
              versions: [
                { id: 'v1', waveformPeaks: new Float32Array([0.2, 0.3]) },
                { id: 'v2', waveformPeaks: null },
              ],
            } as any,
          ],
        } as any,
      ],
    });

    const result = stripHeavyDataForPersist(project);
    expect(result.tracks[0].clips[0].versions![0].waveformPeaks).toBeNull();
    expect(result.tracks[0].clips[0].versions![1].waveformPeaks).toBeNull();
  });

  it('nullifies waveformPeaks on clip takes', () => {
    const project = makeMinimalProject({
      tracks: [
        {
          id: 't1',
          name: 'Track 1',
          type: 'stems',
          clips: [
            {
              id: 'c1',
              start: 0,
              duration: 4,
              waveformPeaks: null,
              takes: [
                { id: 'take1', waveformPeaks: new Float32Array([0.8]) },
              ],
            } as any,
          ],
        } as any,
      ],
    });

    const result = stripHeavyDataForPersist(project);
    expect(result.tracks[0].clips[0].takes![0].waveformPeaks).toBeNull();
  });

  it('nullifies waveformPeaks on assets', () => {
    const project = makeMinimalProject({
      assets: [
        {
          id: 'a1',
          waveformPeaks: new Float32Array([0.1, 0.2]),
          originClipSnapshot: {
            id: 'snap1',
            waveformPeaks: new Float32Array([0.3]),
          },
        } as any,
      ],
    });

    const result = stripHeavyDataForPersist(project);
    expect(result.assets![0].waveformPeaks).toBeNull();
    expect(result.assets![0].originClipSnapshot!.waveformPeaks).toBeNull();
  });

  it('preserves assets without originClipSnapshot', () => {
    const project = makeMinimalProject({
      assets: [
        {
          id: 'a1',
          waveformPeaks: new Float32Array([0.1]),
          originClipSnapshot: undefined,
        } as any,
      ],
    });

    const result = stripHeavyDataForPersist(project);
    expect(result.assets![0].originClipSnapshot).toBeUndefined();
  });

  it('does not mutate the original project', () => {
    const peaks = new Float32Array([0.1, 0.5]);
    const project = makeMinimalProject({
      tracks: [
        {
          id: 't1',
          name: 'Track 1',
          type: 'stems',
          clips: [
            { id: 'c1', start: 0, duration: 4, waveformPeaks: peaks } as any,
          ],
        } as any,
      ],
    });

    stripHeavyDataForPersist(project);
    expect(project.tracks[0].clips[0].waveformPeaks).toBe(peaks);
  });

  it('handles empty tracks array', () => {
    const project = makeMinimalProject({ tracks: [] });
    const result = stripHeavyDataForPersist(project);
    expect(result.tracks).toEqual([]);
  });

  it('handles undefined assets', () => {
    const project = makeMinimalProject({ assets: undefined });
    const result = stripHeavyDataForPersist(project);
    expect(result.assets).toBeUndefined();
  });

  it('preserves non-waveform clip fields', () => {
    const project = makeMinimalProject({
      tracks: [
        {
          id: 't1',
          name: 'Track 1',
          type: 'stems',
          clips: [
            {
              id: 'c1',
              start: 2.5,
              duration: 8,
              name: 'My Clip',
              color: '#ff0000',
              waveformPeaks: new Float32Array([0.5]),
            } as any,
          ],
        } as any,
      ],
    });

    const result = stripHeavyDataForPersist(project);
    const clip = result.tracks[0].clips[0];
    expect(clip.id).toBe('c1');
    expect(clip.start).toBe(2.5);
    expect(clip.duration).toBe(8);
    expect((clip as any).name).toBe('My Clip');
    expect((clip as any).color).toBe('#ff0000');
  });
});
