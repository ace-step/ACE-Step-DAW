import { describe, expect, it } from 'vitest';
import {
  analyzeProjectForMastering,
  buildMasteringChain,
  createDefaultMasteringState,
  ensureMasteringState,
  estimateMasteredLufs,
} from '../mastering';
import type { Project } from '../../types/project';

function createProject(overrides?: Partial<Project>): Project {
  return {
    id: 'project-1',
    name: 'Test Project',
    createdAt: 1,
    updatedAt: 1,
    bpm: 120,
    keyScale: 'C major',
    timeSignature: 4,
    totalDuration: 16,
    tracks: [
      {
        id: 'track-1',
        trackName: 'drums',
        displayName: 'Drums',
        color: '#f00',
        order: 1,
        volume: 0.92,
        muted: false,
        soloed: false,
        pan: -0.35,
        eqLowGain: 1.5,
        eqMidGain: 0.4,
        eqHighGain: -0.8,
        compressorEnabled: true,
        compressorRatio: 3,
        clips: [{
          id: 'clip-1',
          trackId: 'track-1',
          startTime: 0,
          duration: 4,
          prompt: '',
          lyrics: '',
          generationStatus: 'ready',
          generationJobId: null,
          cumulativeMixKey: null,
          isolatedAudioKey: 'audio-1',
          waveformPeaks: null,
        }],
      },
      {
        id: 'track-2',
        trackName: 'bass',
        displayName: 'Bass',
        color: '#0f0',
        order: 2,
        volume: 0.85,
        muted: false,
        soloed: false,
        pan: 0.3,
        eqLowGain: 0.5,
        eqMidGain: 0.2,
        eqHighGain: 1.2,
        clips: [{
          id: 'clip-2',
          trackId: 'track-2',
          startTime: 0,
          duration: 4,
          prompt: '',
          lyrics: '',
          generationStatus: 'ready',
          generationJobId: null,
          cumulativeMixKey: null,
          isolatedAudioKey: 'audio-2',
          waveformPeaks: null,
        }],
      },
    ],
    generationDefaults: {
      inferenceSteps: 20,
      guidanceScale: 7,
      shift: 2,
      thinking: false,
      model: 'test',
    },
    mastering: createDefaultMasteringState(),
    ...overrides,
  };
}

describe('mastering utils', () => {
  it('backfills mastering defaults for older projects', () => {
    const mastering = ensureMasteringState(undefined);
    expect(mastering.status).toBe('idle');
    expect(mastering.enabled).toBe(false);
    expect(mastering.chain.stereoWidth).toBe(1);
  });

  it('analyzes a project and produces bounded mix metrics', () => {
    const analysis = analyzeProjectForMastering(createProject());
    expect(analysis.inputLufs).toBeGreaterThan(-24);
    expect(analysis.inputLufs).toBeLessThan(-9);
    expect(analysis.dynamicRangeDb).toBeGreaterThanOrEqual(4.5);
    expect(analysis.stereoWidth).toBeGreaterThan(0.5);
    expect(analysis.trackCount).toBe(2);
  });

  it('builds a louder chain when the target is more aggressive', () => {
    const analysis = analyzeProjectForMastering(createProject());
    const streaming = buildMasteringChain(analysis, 'balanced', -14);
    const club = buildMasteringChain(analysis, 'loud', -8);
    expect(club.makeupGain).toBeGreaterThan(streaming.makeupGain);
    expect(club.compressorRatio).toBeGreaterThanOrEqual(streaming.compressorRatio);
    expect(estimateMasteredLufs(analysis, club)).toBeGreaterThan(estimateMasteredLufs(analysis, streaming));
  });
});
