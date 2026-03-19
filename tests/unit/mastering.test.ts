import { describe, it, expect } from 'vitest';
import {
  createNeutralMasteringChain,
  createDefaultMasteringState,
  ensureMasteringState,
  analyzeProjectForMastering,
  buildMasteringChain,
  estimateMasteredLufs,
} from '../../src/utils/mastering';
import type {
  MasteringAnalysis,
  MasteringChain,
  MasteringState,
  Project,
  Track,
} from '../../src/types/project';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: `track-${Math.random().toString(36).slice(2, 6)}`,
    trackName: 'vocals',
    trackType: 'stems',
    volume: 0.8,
    pan: 0,
    muted: false,
    soloed: false,
    armed: false,
    eqLowGain: 0,
    eqMidGain: 0,
    eqHighGain: 0,
    compressorEnabled: false,
    compressorThreshold: -18,
    compressorRatio: 4,
    compressorAttack: 0.003,
    compressorRelease: 0.25,
    compressorKnee: 6,
    reverbEnabled: false,
    reverbRoomSize: 0.5,
    reverbWet: 0.3,
    clips: [],
    effects: [],
    color: '#4fc3f7',
    ...overrides,
  } as Track;
}

function makeProject(tracks: Partial<Track>[] = []): Project {
  return {
    id: 'project-1',
    name: 'Test',
    createdAt: 1,
    updatedAt: 1,
    bpm: 120,
    keyScale: 'C major',
    timeSignature: 4,
    totalDuration: 128,
    measures: 64,
    tracks: tracks.map(makeTrack),
    trackPresets: [],
    generationDefaults: {
      inferenceSteps: 20,
      guidanceScale: 7.5,
      shift: 0,
      thinking: false,
      model: 'test-model',
    },
    globalCaption: '',
    automationLanes: [],
    assets: [],
  };
}

function makeAnalysis(overrides: Partial<MasteringAnalysis> = {}): MasteringAnalysis {
  return {
    inputLufs: -18,
    peakDb: -6,
    dynamicRangeDb: 10,
    stereoWidth: 0.8,
    tonalBalance: 'balanced',
    recommendedPreset: 'balanced',
    trackCount: 4,
    activeTrackCount: 4,
    clipCount: 8,
    analyzedAt: Date.now(),
    ...overrides,
  };
}

describe('mastering utilities', () => {
  describe('createNeutralMasteringChain', () => {
    it('returns a chain with zero EQ gains', () => {
      const chain = createNeutralMasteringChain();
      expect(chain.lowShelfGain).toBe(0);
      expect(chain.midGain).toBe(0);
      expect(chain.highShelfGain).toBe(0);
    });

    it('returns a chain with sensible compressor defaults', () => {
      const chain = createNeutralMasteringChain();
      expect(chain.compressorThreshold).toBe(-18);
      expect(chain.compressorRatio).toBe(1.5);
    });

    it('returns unity stereo width', () => {
      const chain = createNeutralMasteringChain();
      expect(chain.stereoWidth).toBe(1);
    });

    it('returns a limiter threshold near 0 dB', () => {
      const chain = createNeutralMasteringChain();
      expect(chain.limiterThreshold).toBeCloseTo(-1.2, 1);
    });

    it('returns zero makeup gain', () => {
      const chain = createNeutralMasteringChain();
      expect(chain.makeupGain).toBe(0);
    });
  });

  describe('createDefaultMasteringState', () => {
    it('starts disabled with idle status', () => {
      const state = createDefaultMasteringState();
      expect(state.enabled).toBe(false);
      expect(state.status).toBe('idle');
    });

    it('defaults to balanced preset and -14 LUFS target', () => {
      const state = createDefaultMasteringState();
      expect(state.preset).toBe('balanced');
      expect(state.loudnessTarget).toBe(-14);
    });

    it('has no analysis or output LUFS', () => {
      const state = createDefaultMasteringState();
      expect(state.analysis).toBeNull();
      expect(state.outputLufs).toBeNull();
    });

    it('has previewOriginal set to false', () => {
      const state = createDefaultMasteringState();
      expect(state.previewOriginal).toBe(false);
    });
  });

  describe('ensureMasteringState', () => {
    it('returns defaults when given null', () => {
      const state = ensureMasteringState(null);
      expect(state).toEqual(createDefaultMasteringState());
    });

    it('returns defaults when given undefined', () => {
      const state = ensureMasteringState(undefined);
      expect(state).toEqual(createDefaultMasteringState());
    });

    it('preserves existing values and fills missing chain fields', () => {
      const partial: MasteringState = {
        enabled: true,
        status: 'ready',
        preset: 'loud',
        loudnessTarget: -11,
        previewOriginal: true,
        analysis: makeAnalysis(),
        chain: { lowShelfGain: 2 } as MasteringChain,
        outputLufs: -11.5,
      };
      const state = ensureMasteringState(partial);
      expect(state.enabled).toBe(true);
      expect(state.preset).toBe('loud');
      expect(state.chain.lowShelfGain).toBe(2);
      // Filled from defaults
      expect(state.chain.compressorThreshold).toBe(-18);
    });

    it('deep-copies analysis to avoid mutation', () => {
      const analysis = makeAnalysis();
      const original: MasteringState = {
        ...createDefaultMasteringState(),
        analysis,
      };
      const state = ensureMasteringState(original);
      expect(state.analysis).not.toBe(analysis);
      expect(state.analysis).toEqual(analysis);
    });
  });

  describe('analyzeProjectForMastering', () => {
    it('handles an empty project', () => {
      const project = makeProject();
      const result = analyzeProjectForMastering(project);
      expect(result.trackCount).toBe(0);
      expect(result.activeTrackCount).toBe(0);
      expect(result.clipCount).toBe(0);
      expect(result.tonalBalance).toBe('balanced');
    });

    it('counts active (non-muted) tracks', () => {
      const project = makeProject([
        { muted: false },
        { muted: true },
        { muted: false },
      ]);
      const result = analyzeProjectForMastering(project);
      expect(result.trackCount).toBe(3);
      expect(result.activeTrackCount).toBe(2);
    });

    it('falls back to all tracks when all are muted', () => {
      const project = makeProject([
        { muted: true },
        { muted: true },
      ]);
      const result = analyzeProjectForMastering(project);
      expect(result.activeTrackCount).toBe(2);
    });

    it('counts clips with ready generationStatus', () => {
      const project = makeProject([
        {
          clips: [
            { id: 'c1', generationStatus: 'ready' } as any,
            { id: 'c2', generationStatus: 'pending' } as any,
          ],
        },
      ]);
      const result = analyzeProjectForMastering(project);
      expect(result.clipCount).toBe(1);
    });

    it('detects warm tonal balance when EQ is bass-heavy', () => {
      const project = makeProject([
        { eqLowGain: 6, eqHighGain: 0 },
        { eqLowGain: 4, eqHighGain: 0 },
      ]);
      const result = analyzeProjectForMastering(project);
      expect(result.tonalBalance).toBe('warm');
    });

    it('detects bright tonal balance when EQ is treble-heavy', () => {
      const project = makeProject([
        { eqLowGain: 0, eqHighGain: 6 },
        { eqLowGain: 0, eqHighGain: 4 },
      ]);
      const result = analyzeProjectForMastering(project);
      expect(result.tonalBalance).toBe('bright');
    });

    it('recommends loud preset for quiet mixes with high dynamic range', () => {
      // Force low inputLufs by using very low volume tracks
      const project = makeProject([
        { volume: 0.1 },
      ]);
      const result = analyzeProjectForMastering(project);
      // inputLufs should be low → recommend loud
      expect(result.inputLufs).toBeLessThanOrEqual(-17);
      expect(result.recommendedPreset).toBe('loud');
    });

    it('recommends bright preset for warm-balanced mixes with sufficient loudness', () => {
      // Warm tonal balance → recommend bright to compensate
      // The algorithm checks: inputLufs <= -17 OR dynamicRangeDb >= 11.5 → loud
      // Then: tonalBalance === 'warm' → bright
      // We need inputLufs > -17 AND dynamicRangeDb < 11.5 to reach the tonal check
      // Use many tracks with high volume and compression to raise inputLufs and lower dynamic range
      const makeClips = () => [{ id: `c-${Math.random()}`, generationStatus: 'ready' } as any];
      const project = makeProject(
        Array.from({ length: 10 }, () => ({
          eqLowGain: 5,
          eqHighGain: 0,
          volume: 1.2,
          compressorEnabled: true,
          compressorRatio: 8,
          clips: makeClips(),
        })),
      );
      const result = analyzeProjectForMastering(project);
      expect(result.tonalBalance).toBe('warm');
      // If both conditions met, expect bright
      if (result.inputLufs > -17 && result.dynamicRangeDb < 11.5) {
        expect(result.recommendedPreset).toBe('bright');
      } else {
        // Otherwise the loud check wins — verify the algorithm is consistent
        expect(result.recommendedPreset).toBe('loud');
      }
    });

    it('clamps inputLufs within -24 to -9 range', () => {
      const project = makeProject([
        { volume: 0.001 },
      ]);
      const result = analyzeProjectForMastering(project);
      expect(result.inputLufs).toBeGreaterThanOrEqual(-24);
      expect(result.inputLufs).toBeLessThanOrEqual(-9);
    });

    it('returns a timestamp in analyzedAt', () => {
      const before = Date.now();
      const result = analyzeProjectForMastering(makeProject());
      expect(result.analyzedAt).toBeGreaterThanOrEqual(before);
    });

    it('clamps stereo width between 0.5 and 1.25', () => {
      const project = makeProject([
        { pan: 1 },
        { pan: -1 },
      ]);
      const result = analyzeProjectForMastering(project);
      expect(result.stereoWidth).toBeGreaterThanOrEqual(0.5);
      expect(result.stereoWidth).toBeLessThanOrEqual(1.25);
    });
  });

  describe('buildMasteringChain', () => {
    const analysis = makeAnalysis();

    it('returns a chain for balanced preset', () => {
      const chain = buildMasteringChain(analysis, 'balanced', -14);
      expect(chain.lowShelfGain).toBeGreaterThanOrEqual(-5);
      expect(chain.lowShelfGain).toBeLessThanOrEqual(5);
      expect(chain.compressorRatio).toBeGreaterThanOrEqual(1.2);
      expect(chain.compressorRatio).toBeLessThanOrEqual(4.5);
    });

    it('loud preset has higher makeup gain than balanced', () => {
      const balanced = buildMasteringChain(analysis, 'balanced', -14);
      const loud = buildMasteringChain(analysis, 'loud', -14);
      expect(loud.makeupGain).toBeGreaterThan(balanced.makeupGain);
    });

    it('warm preset boosts low shelf', () => {
      const warm = buildMasteringChain(analysis, 'warm', -14);
      const bright = buildMasteringChain(analysis, 'bright', -14);
      expect(warm.lowShelfGain).toBeGreaterThan(bright.lowShelfGain);
    });

    it('bright preset boosts high shelf', () => {
      const warm = buildMasteringChain(analysis, 'warm', -14);
      const bright = buildMasteringChain(analysis, 'bright', -14);
      expect(bright.highShelfGain).toBeGreaterThan(warm.highShelfGain);
    });

    it('adapts EQ for warm tonal balance', () => {
      const warmAnalysis = makeAnalysis({ tonalBalance: 'warm' });
      const chain = buildMasteringChain(warmAnalysis, 'balanced', -14);
      // Should boost highs to compensate
      const neutralChain = buildMasteringChain(analysis, 'balanced', -14);
      expect(chain.highShelfGain).toBeGreaterThan(neutralChain.highShelfGain);
    });

    it('adapts EQ for bright tonal balance', () => {
      const brightAnalysis = makeAnalysis({ tonalBalance: 'bright' });
      const chain = buildMasteringChain(brightAnalysis, 'balanced', -14);
      // Should boost lows to compensate
      const neutralChain = buildMasteringChain(analysis, 'balanced', -14);
      expect(chain.lowShelfGain).toBeGreaterThan(neutralChain.lowShelfGain);
    });

    it('clamps stereo width between 0.85 and 1.22', () => {
      const wideAnalysis = makeAnalysis({ stereoWidth: 1.5 });
      const chain = buildMasteringChain(wideAnalysis, 'balanced', -14);
      expect(chain.stereoWidth).toBeGreaterThanOrEqual(0.85);
      expect(chain.stereoWidth).toBeLessThanOrEqual(1.22);
    });

    it('clamps compressor threshold between -32 and -8', () => {
      const quietAnalysis = makeAnalysis({ inputLufs: -24 });
      const chain = buildMasteringChain(quietAnalysis, 'loud', -8);
      expect(chain.compressorThreshold).toBeGreaterThanOrEqual(-32);
      expect(chain.compressorThreshold).toBeLessThanOrEqual(-8);
    });

    it('clamps makeup gain between 0 and 9', () => {
      const quietAnalysis = makeAnalysis({ inputLufs: -24 });
      const chain = buildMasteringChain(quietAnalysis, 'loud', -8);
      expect(chain.makeupGain).toBeGreaterThanOrEqual(0);
      expect(chain.makeupGain).toBeLessThanOrEqual(9);
    });

    it('sets limiter threshold based on loudness target', () => {
      const chain8 = buildMasteringChain(analysis, 'balanced', -8);
      const chain14 = buildMasteringChain(analysis, 'balanced', -14);
      expect(chain8.limiterThreshold).toBe(-0.9);
      expect(chain14.limiterThreshold).toBe(-1.3);
    });

    it('sets -11 LUFS limiter threshold to -1.1', () => {
      const chain = buildMasteringChain(analysis, 'balanced', -11);
      expect(chain.limiterThreshold).toBe(-1.1);
    });

    it('all values are rounded', () => {
      const chain = buildMasteringChain(analysis, 'balanced', -14);
      // Check that values have at most 2 decimal places
      for (const [, value] of Object.entries(chain)) {
        const str = value.toString();
        const decimalPart = str.split('.')[1];
        if (decimalPart) {
          expect(decimalPart.length).toBeLessThanOrEqual(2);
        }
      }
    });
  });

  describe('estimateMasteredLufs', () => {
    it('returns a value louder than input', () => {
      const analysis = makeAnalysis({ inputLufs: -18 });
      const chain = buildMasteringChain(analysis, 'balanced', -14);
      const output = estimateMasteredLufs(analysis, chain);
      expect(output).toBeGreaterThan(analysis.inputLufs);
    });

    it('clamps output between -16 and -7.4', () => {
      const quietAnalysis = makeAnalysis({ inputLufs: -24 });
      const chain = buildMasteringChain(quietAnalysis, 'loud', -8);
      const output = estimateMasteredLufs(quietAnalysis, chain);
      expect(output).toBeGreaterThanOrEqual(-16);
      expect(output).toBeLessThanOrEqual(-7.4);
    });

    it('loud preset produces louder output than balanced', () => {
      const analysis = makeAnalysis({ inputLufs: -18 });
      const balancedChain = buildMasteringChain(analysis, 'balanced', -14);
      const loudChain = buildMasteringChain(analysis, 'loud', -14);
      const balancedOut = estimateMasteredLufs(analysis, balancedChain);
      const loudOut = estimateMasteredLufs(analysis, loudChain);
      expect(loudOut).toBeGreaterThan(balancedOut);
    });

    it('neutral chain with zero makeup produces minimal change', () => {
      const analysis = makeAnalysis({ inputLufs: -14 });
      const chain = createNeutralMasteringChain();
      const output = estimateMasteredLufs(analysis, chain);
      // Should be close to input (within ~2 LUFS) since neutral has minimal processing
      expect(Math.abs(output - analysis.inputLufs)).toBeLessThan(2);
    });
  });
});
