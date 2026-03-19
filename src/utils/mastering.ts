import type {
  MasteringAnalysis,
  MasteringLoudnessTarget,
  MasteringPreset,
  MasteringSettings,
  Project,
} from '../types/project';

const PRESET_SUMMARIES: Record<MasteringPreset, string> = {
  balanced: 'Balanced keeps the mix controlled with light tonal correction.',
  loud: 'Loud pushes density and output for more aggressive streaming level.',
  warm: 'Warm adds low-mid weight and softer top-end for a rounder master.',
  bright: 'Bright adds clarity and air to lift darker arrangements.',
};

export function createDefaultMasteringAnalysis(): MasteringAnalysis {
  return {
    status: 'idle',
    inputLufs: -18,
    outputLufs: -14,
    dynamicRange: 10,
    stereoWidth: 0.5,
    lowBalance: 0.33,
    midBalance: 0.34,
    highBalance: 0.33,
    summary: PRESET_SUMMARIES.balanced,
  };
}

export function createDefaultMasteringSettings(): MasteringSettings {
  return {
    enabled: false,
    previewBypassed: false,
    preset: 'balanced',
    targetLufs: -14,
    analysis: createDefaultMasteringAnalysis(),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function analyzeProjectForMastering(
  project: Project,
  preset: MasteringPreset,
  targetLufs: MasteringLoudnessTarget,
): MasteringAnalysis {
  const tracks = project.tracks ?? [];
  const activeTracks = tracks.filter((track) => !track.muted);
  const activeTrackCount = Math.max(activeTracks.length, 1);
  const readyClipCount = tracks.reduce(
    (sum, track) => sum + track.clips.filter((clip) => clip.generationStatus === 'ready').length,
    0,
  );
  const averageVolume =
    activeTracks.reduce((sum, track) => sum + track.volume, 0) / activeTrackCount;
  const lowEnergy =
    tracks.filter((track) => ['bass', 'drums', 'percussion'].includes(track.trackName)).length * 1.35;
  const highEnergy =
    tracks.filter((track) => ['synth', 'strings', 'keyboard', 'fx'].includes(track.trackName)).length * 1.15;
  const eqTilt = tracks.reduce(
    (sum, track) => sum + (track.eqHighGain ?? 0) - (track.eqLowGain ?? 0),
    0,
  ) / activeTrackCount;

  const rawInputLufs = -24 + activeTrackCount * 1.15 + averageVolume * 5.5 + readyClipCount * 0.2;
  const inputLufs = Number(clamp(rawInputLufs, -26, -10).toFixed(1));
  const density = clamp((activeTrackCount + readyClipCount * 0.35) / 12, 0.2, 1);

  let recommendedPreset: MasteringPreset = 'balanced';
  if (lowEnergy - highEnergy > 1.25 || eqTilt < -1.5) {
    recommendedPreset = 'bright';
  } else if (highEnergy - lowEnergy > 1.25 || eqTilt > 1.5) {
    recommendedPreset = 'warm';
  } else if (density > 0.72) {
    recommendedPreset = 'loud';
  }

  const lowBalance = clamp(0.28 + lowEnergy * 0.045 - eqTilt * 0.01, 0.15, 0.6);
  const highBalance = clamp(0.25 + highEnergy * 0.04 + eqTilt * 0.012, 0.15, 0.6);
  const midBalance = clamp(1 - lowBalance - highBalance, 0.15, 0.7);
  const normalizedTotal = lowBalance + midBalance + highBalance;

  const presetLift =
    preset === 'loud' ? 2.8 :
    preset === 'warm' ? 1.8 :
    preset === 'bright' ? 1.7 :
    1.2;
  const outputLufs = Number(Math.max(targetLufs, inputLufs + presetLift).toFixed(1));
  const dynamicRange = Number(clamp(13 - density * 4.5 - (preset === 'loud' ? 1.2 : 0), 5, 14).toFixed(1));
  const stereoWidth = Number(clamp(0.42 + highEnergy * 0.05 + (preset === 'bright' ? 0.08 : 0), 0.2, 0.95).toFixed(2));

  return {
    status: 'ready',
    analyzedAt: Date.now(),
    recommendedPreset,
    inputLufs,
    outputLufs,
    dynamicRange,
    stereoWidth,
    lowBalance: Number((lowBalance / normalizedTotal).toFixed(2)),
    midBalance: Number((midBalance / normalizedTotal).toFixed(2)),
    highBalance: Number((highBalance / normalizedTotal).toFixed(2)),
    summary: PRESET_SUMMARIES[preset],
  };
}
