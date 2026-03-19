import type {
  LoudnessTarget,
  MasteringAnalysis,
  MasteringChain,
  MasteringPreset,
  MasteringState,
  MasteringTonalBalance,
  Project,
  Track,
} from '../types/project';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits: number = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function countTrackClips(track: Track): number {
  const readyAudio = track.clips.filter((clip) => clip.generationStatus === 'ready').length;
  const midiClips = track.trackType === 'pianoRoll'
    ? track.clips.filter((clip) => (clip.midiData?.notes.length ?? 0) > 0).length
    : 0;
  const sequencerPatterns = track.trackType === 'sequencer' && track.sequencerPattern
    ? 1
    : 0;
  return readyAudio + midiClips + sequencerPatterns;
}

function getTonalBalance(eqTilt: number): MasteringTonalBalance {
  if (eqTilt <= -1.25) return 'warm';
  if (eqTilt >= 1.25) return 'bright';
  return 'balanced';
}

export function createNeutralMasteringChain(): MasteringChain {
  return {
    lowShelfGain: 0,
    midGain: 0,
    highShelfGain: 0,
    compressorThreshold: -18,
    compressorRatio: 1.5,
    stereoWidth: 1,
    limiterThreshold: -1.2,
    makeupGain: 0,
  };
}

export function createDefaultMasteringState(): MasteringState {
  return {
    enabled: false,
    status: 'idle',
    preset: 'balanced',
    loudnessTarget: -14,
    previewOriginal: false,
    analysis: null,
    chain: createNeutralMasteringChain(),
    outputLufs: null,
  };
}

export function ensureMasteringState(mastering?: MasteringState | null): MasteringState {
  const defaults = createDefaultMasteringState();
  if (!mastering) return defaults;
  return {
    ...defaults,
    ...mastering,
    chain: {
      ...defaults.chain,
      ...mastering.chain,
    },
    analysis: mastering.analysis
      ? { ...mastering.analysis }
      : null,
  };
}

export function analyzeProjectForMastering(project: Project): MasteringAnalysis {
  const tracks = project.tracks;
  const activeTracks = tracks.filter((track) => !track.muted);
  const sourceTracks = activeTracks.length > 0 ? activeTracks : tracks;
  const trackCount = tracks.length;
  const activeTrackCount = sourceTracks.length;
  const clipCount = sourceTracks.reduce((sum, track) => sum + countTrackClips(track), 0);

  const averageVolume = sourceTracks.length > 0
    ? sourceTracks.reduce((sum, track) => sum + (track.volume ?? 0.8), 0) / sourceTracks.length
    : 0.8;
  const averagePanSpread = sourceTracks.length > 0
    ? sourceTracks.reduce((sum, track) => sum + Math.abs(track.pan ?? 0), 0) / sourceTracks.length
    : 0;
  const averageEqTilt = sourceTracks.length > 0
    ? sourceTracks.reduce(
        (sum, track) => sum + ((track.eqHighGain ?? 0) - (track.eqLowGain ?? 0)),
        0,
      ) / sourceTracks.length
    : 0;
  const averageCompression = sourceTracks.length > 0
    ? sourceTracks.reduce((sum, track) => {
        if (!(track.compressorEnabled ?? false)) return sum;
        return sum + ((track.compressorRatio ?? 4) - 1) / 19;
      }, 0) / sourceTracks.length
    : 0;

  const volumeDb = averageVolume > 0 ? 20 * Math.log10(averageVolume) : -18;
  const clipDensity = clipCount / Math.max(1, activeTrackCount);
  const inputLufs = clamp(
    -23
      + activeTrackCount * 1.1
      + clipDensity * 0.55
      + (volumeDb + 6) * 0.85
      + averageCompression * 2.8,
    -24,
    -9,
  );
  const peakDb = clamp(inputLufs + 9.5 - averageCompression * 2.2, -10, -0.4);
  const dynamicRangeDb = clamp(
    13.5 - averageCompression * 4.4 - activeTrackCount * 0.18,
    4.5,
    14,
  );
  const stereoWidth = clamp(0.55 + averagePanSpread * 1.3, 0.5, 1.25);
  const tonalBalance = getTonalBalance(averageEqTilt);

  let recommendedPreset: MasteringPreset = 'balanced';
  if (inputLufs <= -17 || dynamicRangeDb >= 11.5) {
    recommendedPreset = 'loud';
  } else if (tonalBalance === 'warm') {
    recommendedPreset = 'bright';
  } else if (tonalBalance === 'bright') {
    recommendedPreset = 'warm';
  }

  return {
    inputLufs: round(inputLufs),
    peakDb: round(peakDb),
    dynamicRangeDb: round(dynamicRangeDb),
    stereoWidth: round(stereoWidth, 2),
    tonalBalance,
    recommendedPreset,
    trackCount,
    activeTrackCount,
    clipCount,
    analyzedAt: Date.now(),
  };
}

export function buildMasteringChain(
  analysis: MasteringAnalysis,
  preset: MasteringPreset,
  loudnessTarget: LoudnessTarget,
): MasteringChain {
  const presetDefaults: Record<MasteringPreset, MasteringChain> = {
    balanced: {
      lowShelfGain: 0.3,
      midGain: 0.2,
      highShelfGain: 0.5,
      compressorThreshold: -18,
      compressorRatio: 1.9,
      stereoWidth: 1.02,
      limiterThreshold: -1.2,
      makeupGain: 1.2,
    },
    loud: {
      lowShelfGain: 0.4,
      midGain: 0.3,
      highShelfGain: 0.8,
      compressorThreshold: -24,
      compressorRatio: 3.2,
      stereoWidth: 1.04,
      limiterThreshold: -0.9,
      makeupGain: 3.6,
    },
    warm: {
      lowShelfGain: 1.6,
      midGain: 0.5,
      highShelfGain: -1.1,
      compressorThreshold: -20,
      compressorRatio: 2.2,
      stereoWidth: 1.01,
      limiterThreshold: -1.2,
      makeupGain: 1.8,
    },
    bright: {
      lowShelfGain: -0.5,
      midGain: 0.6,
      highShelfGain: 1.9,
      compressorThreshold: -19,
      compressorRatio: 2.1,
      stereoWidth: 1.08,
      limiterThreshold: -1.1,
      makeupGain: 1.8,
    },
  };

  const chain = { ...presetDefaults[preset] };
  const targetDelta = loudnessTarget - analysis.inputLufs;

  if (analysis.tonalBalance === 'warm') {
    chain.highShelfGain += 0.9;
    chain.midGain += 0.25;
  } else if (analysis.tonalBalance === 'bright') {
    chain.lowShelfGain += 0.8;
    chain.highShelfGain -= 0.7;
  }

  chain.stereoWidth = clamp(
    Math.max(chain.stereoWidth, analysis.stereoWidth + 0.04),
    0.85,
    1.22,
  );
  chain.compressorThreshold = clamp(
    chain.compressorThreshold - Math.max(0, targetDelta) * 0.8,
    -32,
    -8,
  );
  chain.compressorRatio = clamp(
    chain.compressorRatio + Math.max(0, targetDelta) * 0.18,
    1.2,
    4.5,
  );
  chain.makeupGain = clamp(
    chain.makeupGain + targetDelta * 0.72,
    0,
    9,
  );
  chain.limiterThreshold = loudnessTarget === -8
    ? -0.9
    : loudnessTarget === -11
      ? -1.1
      : -1.3;

  return {
    lowShelfGain: round(chain.lowShelfGain),
    midGain: round(chain.midGain),
    highShelfGain: round(chain.highShelfGain),
    compressorThreshold: round(chain.compressorThreshold),
    compressorRatio: round(chain.compressorRatio, 2),
    stereoWidth: round(chain.stereoWidth, 2),
    limiterThreshold: round(chain.limiterThreshold, 2),
    makeupGain: round(chain.makeupGain),
  };
}

export function estimateMasteredLufs(
  analysis: MasteringAnalysis,
  chain: MasteringChain,
): number {
  const eqLift = Math.max(0, chain.lowShelfGain + chain.midGain * 0.35 + chain.highShelfGain * 0.55) * 0.08;
  const dynamicsLift = Math.max(0, chain.compressorRatio - 1) * 0.95;
  const makeupLift = chain.makeupGain * 0.78;
  const limiterLift = Math.max(0, -chain.limiterThreshold - 0.8) * 0.45;

  return round(
    clamp(
      analysis.inputLufs + eqLift + dynamicsLift + makeupLift + limiterLift,
      -16,
      -7.4,
    ),
  );
}
