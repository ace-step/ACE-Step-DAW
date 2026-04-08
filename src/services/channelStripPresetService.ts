import type {
  Track,
  TrackEffect,
  ChannelStripPreset,
  ChannelStripPresetData,
  ApplyChannelStripOptions,
} from '../types/project';

export const CHANNEL_STRIP_PRESETS_KEY = 'ace-step-daw-channel-strip-presets';

// ── Capture / Apply ──────────────────────────────────────────────────

/** Extract mixer-relevant state from a track into a ChannelStripPresetData. */
export function captureChannelStrip(track: Track): ChannelStripPresetData {
  return {
    volume: track.volume,
    pan: track.pan,
    panMode: track.panMode,
    panLeft: track.panLeft,
    panRight: track.panRight,
    eqLowGain: track.eqLowGain,
    eqMidGain: track.eqMidGain,
    eqHighGain: track.eqHighGain,
    compressorEnabled: track.compressorEnabled,
    compressorThreshold: track.compressorThreshold,
    compressorRatio: track.compressorRatio,
    reverbMix: track.reverbMix,
    reverbRoomSize: track.reverbRoomSize,
    effectsBypassed: track.effectsBypassed,
    effects: structuredClone(track.effects ?? []),
    sends: (track.sends ?? []).map((s) => ({ amount: s.amount, prePost: s.prePost })),
  };
}

let _idCounter = 0;
function generateId(): string {
  return `csp_${Date.now()}_${++_idCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Build a partial Track update from a preset, optionally filtered by ApplyChannelStripOptions.
 * Effects get new IDs to prevent collisions.
 */
export function applyChannelStrip(
  preset: ChannelStripPresetData,
  options?: ApplyChannelStripOptions,
): Partial<Track> {
  const update: Partial<Track> = {};

  const isSelective = options?.eqOnly || options?.effectsOnly || options?.compressorOnly || options?.sendsOnly;

  if (!isSelective || options?.eqOnly) {
    if (preset.eqLowGain !== undefined) update.eqLowGain = preset.eqLowGain;
    if (preset.eqMidGain !== undefined) update.eqMidGain = preset.eqMidGain;
    if (preset.eqHighGain !== undefined) update.eqHighGain = preset.eqHighGain;
  }

  if (!isSelective || options?.compressorOnly) {
    if (preset.compressorEnabled !== undefined) update.compressorEnabled = preset.compressorEnabled;
    if (preset.compressorThreshold !== undefined) update.compressorThreshold = preset.compressorThreshold;
    if (preset.compressorRatio !== undefined) update.compressorRatio = preset.compressorRatio;
  }

  if (!isSelective || options?.effectsOnly) {
    update.effects = structuredClone(preset.effects).map((fx: TrackEffect) => ({
      ...fx,
      id: generateId(),
    }));
    if (preset.effectsBypassed !== undefined) update.effectsBypassed = preset.effectsBypassed;
  }

  if (!isSelective) {
    if (preset.pan !== undefined) update.pan = preset.pan;
    if (preset.panMode !== undefined) update.panMode = preset.panMode;
    if (preset.panLeft !== undefined) update.panLeft = preset.panLeft;
    if (preset.panRight !== undefined) update.panRight = preset.panRight;
    if (preset.reverbMix !== undefined) update.reverbMix = preset.reverbMix;
    if (preset.reverbRoomSize !== undefined) update.reverbRoomSize = preset.reverbRoomSize;

    if (!options?.keepVolume && preset.volume !== undefined) {
      update.volume = preset.volume;
    }
  }

  return update;
}

// ── Export / Import ──────────────────────────────────────────────────

/** Serialize non-factory presets to a JSON string for file export. */
export function exportPresetsToJSON(presets: ChannelStripPreset[]): string {
  return JSON.stringify(presets.filter((p) => !p.isFactory));
}

/** Parse a JSON string into preset array. Assigns new IDs and marks as non-factory. */
export function importPresetsFromJSON(json: string): ChannelStripPreset[] {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error('Expected an array of presets');
  }
  const now = Date.now();
  return parsed
    .filter((entry: unknown) => typeof entry === 'object' && entry !== null && 'name' in entry && 'effects' in entry)
    .map((entry: Record<string, unknown>) => ({
      ...entry,
      id: generateId(),
      isFactory: false,
      createdAt: now,
      updatedAt: now,
      description: (entry.description as string) ?? '',
      category: (entry.category as string) ?? 'custom',
      tags: Array.isArray(entry.tags) ? entry.tags : [],
      effects: Array.isArray(entry.effects) ? entry.effects : [],
    })) as ChannelStripPreset[];
}

// ── Factory Presets ──────────────────────────────────────────────────

export function getFactoryPresets(): ChannelStripPreset[] {
  const now = 0; // epoch for factory presets
  return [
    {
      id: 'factory-vocal-warmth',
      name: 'Vocal Warmth',
      description: 'Warm vocal chain: gentle EQ boost, light compression, subtle reverb',
      category: 'vocal',
      tags: ['warm', 'clean', 'pop'],
      isFactory: true,
      createdAt: now,
      updatedAt: now,
      eqLowGain: -2,
      eqMidGain: 3,
      eqHighGain: 2,
      compressorEnabled: true,
      compressorThreshold: -18,
      compressorRatio: 3,
      reverbMix: 0.15,
      reverbRoomSize: 0.4,
      effectsBypassed: false,
      effects: [
        { id: 'fv-eq', type: 'eq3', enabled: true, params: { low: -2, mid: 3, high: 2, lowFrequency: 250, highFrequency: 8000 } },
        { id: 'fv-comp', type: 'compressor', enabled: true, params: { threshold: -18, ratio: 3, attack: 0.01, release: 0.2, knee: 10 } },
      ],
    },
    {
      id: 'factory-vocal-presence',
      name: 'Vocal Presence',
      description: 'Bright vocal with presence boost and tighter compression',
      category: 'vocal',
      tags: ['bright', 'presence', 'pop'],
      isFactory: true,
      createdAt: now,
      updatedAt: now,
      eqLowGain: -3,
      eqMidGain: 1,
      eqHighGain: 5,
      compressorEnabled: true,
      compressorThreshold: -22,
      compressorRatio: 5,
      reverbMix: 0.1,
      reverbRoomSize: 0.3,
      effectsBypassed: false,
      effects: [
        { id: 'fp-eq', type: 'eq3', enabled: true, params: { low: -3, mid: 1, high: 5, lowFrequency: 250, highFrequency: 8000 } },
        { id: 'fp-comp', type: 'compressor', enabled: true, params: { threshold: -22, ratio: 5, attack: 0.005, release: 0.15, knee: 6 } },
      ],
    },
    {
      id: 'factory-drums-punch',
      name: 'Drums Punch',
      description: 'Punchy drum bus: low-end boost, aggressive compression',
      category: 'drums',
      tags: ['punchy', 'bus', 'rock'],
      isFactory: true,
      createdAt: now,
      updatedAt: now,
      eqLowGain: 4,
      eqMidGain: -1,
      eqHighGain: 2,
      compressorEnabled: true,
      compressorThreshold: -16,
      compressorRatio: 6,
      effectsBypassed: false,
      effects: [
        { id: 'fd-eq', type: 'eq3', enabled: true, params: { low: 4, mid: -1, high: 2, lowFrequency: 250, highFrequency: 8000 } },
        { id: 'fd-comp', type: 'compressor', enabled: true, params: { threshold: -16, ratio: 6, attack: 0.001, release: 0.1, knee: 3 } },
      ],
    },
    {
      id: 'factory-bass-tight',
      name: 'Bass Tight',
      description: 'Tight bass: focused low-end, high cut, firm compression',
      category: 'bass',
      tags: ['tight', 'focused', 'clean'],
      isFactory: true,
      createdAt: now,
      updatedAt: now,
      eqLowGain: 3,
      eqMidGain: -2,
      eqHighGain: -4,
      compressorEnabled: true,
      compressorThreshold: -20,
      compressorRatio: 4,
      effectsBypassed: false,
      effects: [
        { id: 'fb-eq', type: 'eq3', enabled: true, params: { low: 3, mid: -2, high: -4, lowFrequency: 250, highFrequency: 8000 } },
        { id: 'fb-comp', type: 'compressor', enabled: true, params: { threshold: -20, ratio: 4, attack: 0.01, release: 0.2, knee: 6 } },
      ],
    },
    {
      id: 'factory-guitar-crunch',
      name: 'Guitar Crunch',
      description: 'Crunchy guitar: mid-forward EQ, light saturation character',
      category: 'guitar',
      tags: ['crunch', 'rock', 'mid-forward'],
      isFactory: true,
      createdAt: now,
      updatedAt: now,
      eqLowGain: -1,
      eqMidGain: 4,
      eqHighGain: 1,
      compressorEnabled: true,
      compressorThreshold: -15,
      compressorRatio: 3,
      effectsBypassed: false,
      effects: [
        { id: 'fg-eq', type: 'eq3', enabled: true, params: { low: -1, mid: 4, high: 1, lowFrequency: 250, highFrequency: 8000 } },
        { id: 'fg-comp', type: 'compressor', enabled: true, params: { threshold: -15, ratio: 3, attack: 0.005, release: 0.25, knee: 10 } },
      ],
    },
    {
      id: 'factory-keys-clean',
      name: 'Keys Clean',
      description: 'Clean keys: balanced EQ, gentle compression, light reverb',
      category: 'keys',
      tags: ['clean', 'piano', 'balanced'],
      isFactory: true,
      createdAt: now,
      updatedAt: now,
      eqLowGain: 0,
      eqMidGain: 1,
      eqHighGain: 2,
      compressorEnabled: true,
      compressorThreshold: -20,
      compressorRatio: 2,
      reverbMix: 0.2,
      reverbRoomSize: 0.5,
      effectsBypassed: false,
      effects: [
        { id: 'fk-eq', type: 'eq3', enabled: true, params: { low: 0, mid: 1, high: 2, lowFrequency: 250, highFrequency: 8000 } },
        { id: 'fk-comp', type: 'compressor', enabled: true, params: { threshold: -20, ratio: 2, attack: 0.01, release: 0.3, knee: 10 } },
      ],
    },
    {
      id: 'factory-synth-wide',
      name: 'Synth Wide',
      description: 'Wide synth pad: scooped mids, stereo enhancement, long reverb',
      category: 'synth',
      tags: ['wide', 'pad', 'ambient'],
      isFactory: true,
      createdAt: now,
      updatedAt: now,
      eqLowGain: 1,
      eqMidGain: -3,
      eqHighGain: 3,
      compressorEnabled: false,
      reverbMix: 0.4,
      reverbRoomSize: 0.8,
      effectsBypassed: false,
      effects: [
        { id: 'fs-eq', type: 'eq3', enabled: true, params: { low: 1, mid: -3, high: 3, lowFrequency: 250, highFrequency: 8000 } },
      ],
    },
    {
      id: 'factory-strings-lush',
      name: 'Strings Lush',
      description: 'Lush strings: warm low-end, gentle presence, hall reverb',
      category: 'strings',
      tags: ['lush', 'warm', 'orchestral'],
      isFactory: true,
      createdAt: now,
      updatedAt: now,
      eqLowGain: 2,
      eqMidGain: 0,
      eqHighGain: 1,
      compressorEnabled: true,
      compressorThreshold: -22,
      compressorRatio: 2,
      reverbMix: 0.35,
      reverbRoomSize: 0.7,
      effectsBypassed: false,
      effects: [
        { id: 'fst-eq', type: 'eq3', enabled: true, params: { low: 2, mid: 0, high: 1, lowFrequency: 250, highFrequency: 8000 } },
        { id: 'fst-comp', type: 'compressor', enabled: true, params: { threshold: -22, ratio: 2, attack: 0.02, release: 0.4, knee: 10 } },
      ],
    },
  ] as ChannelStripPreset[];
}

// ── localStorage Persistence ────────────────────────────────────────

/** Load the full preset library: factory presets + user presets from localStorage. */
export function loadPresetLibrary(): ChannelStripPreset[] {
  const factory = getFactoryPresets();
  try {
    const raw = localStorage.getItem(CHANNEL_STRIP_PRESETS_KEY);
    if (!raw) return factory;
    const userPresets: ChannelStripPreset[] = JSON.parse(raw);
    if (!Array.isArray(userPresets)) return factory;
    return [...factory, ...userPresets];
  } catch {
    return factory;
  }
}

/** Persist only user (non-factory) presets to localStorage. */
export function savePresetLibrary(presets: ChannelStripPreset[]): void {
  const userOnly = presets.filter((p) => !p.isFactory);
  localStorage.setItem(CHANNEL_STRIP_PRESETS_KEY, JSON.stringify(userOnly));
}

/** Add a preset to the library and persist. Returns updated full library. */
export function addPresetToLibrary(preset: ChannelStripPreset): ChannelStripPreset[] {
  const all = loadPresetLibrary();
  all.push(preset);
  savePresetLibrary(all);
  return all;
}

/** Remove a user preset by ID. Factory presets are protected. Returns updated library. */
export function removePresetFromLibrary(presetId: string): ChannelStripPreset[] {
  const all = loadPresetLibrary();
  const target = all.find((p) => p.id === presetId);
  if (!target || target.isFactory) return all;
  const updated = all.filter((p) => p.id !== presetId);
  savePresetLibrary(updated);
  return updated;
}

/** Rename a user preset. Factory presets are protected. Returns updated library. */
export function renamePreset(presetId: string, newName: string): ChannelStripPreset[] {
  const all = loadPresetLibrary();
  const target = all.find((p) => p.id === presetId);
  if (!target || target.isFactory) return all;
  target.name = newName;
  target.updatedAt = Date.now();
  savePresetLibrary(all);
  return all;
}

/** Duplicate any preset (including factory) as a new user preset. Returns updated library. */
export function duplicatePreset(presetId: string): ChannelStripPreset[] {
  const all = loadPresetLibrary();
  const source = all.find((p) => p.id === presetId);
  if (!source) return all;

  const now = Date.now();
  const copy: ChannelStripPreset = {
    ...structuredClone(source),
    id: generateId(),
    name: `${source.name} (Copy)`,
    isFactory: false,
    createdAt: now,
    updatedAt: now,
  };

  all.push(copy);
  savePresetLibrary(all);
  return all;
}
