import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  captureChannelStrip,
  applyChannelStrip,
  exportPresetsToJSON,
  importPresetsFromJSON,
  loadPresetLibrary,
  savePresetLibrary,
  addPresetToLibrary,
  removePresetFromLibrary,
  renamePreset,
  duplicatePreset,
  getFactoryPresets,
  CHANNEL_STRIP_PRESETS_KEY,
} from '../channelStripPresetService';
import type {
  Track,
  TrackEffect,
  ChannelStripPreset,
  ChannelStripPresetData,
  ApplyChannelStripOptions,
} from '../../types/project';

// ── Fixtures ──────────────────────────────────────────────────────

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    trackName: 'vocals',
    displayName: 'Lead Vocal',
    color: '#ff0000',
    order: 0,
    volume: 0.75,
    muted: false,
    soloed: false,
    clips: [],
    pan: 0,
    panMode: 'stereo',
    eqLowGain: 2,
    eqMidGain: -1,
    eqHighGain: 3,
    compressorEnabled: true,
    compressorThreshold: -20,
    compressorRatio: 6,
    reverbMix: 0.3,
    reverbRoomSize: 0.6,
    effectsBypassed: false,
    effects: [
      { id: 'fx-1', type: 'eq3', enabled: true, params: { low: 0, mid: 0, high: 0, lowFrequency: 250, highFrequency: 8000 } },
      { id: 'fx-2', type: 'compressor', enabled: true, params: { threshold: -18, ratio: 4, attack: 0.003, release: 0.25, knee: 10 } },
    ],
    sends: [
      { returnTrackId: 'return-1', amount: 0.5, prePost: 'post' },
    ],
    ...overrides,
  };
}

function makePreset(overrides: Partial<ChannelStripPreset> = {}): ChannelStripPreset {
  return {
    id: 'preset-1',
    name: 'Test Preset',
    description: 'A test preset',
    category: 'vocal',
    tags: ['test'],
    isFactory: false,
    createdAt: 1000,
    updatedAt: 1000,
    effects: [],
    ...overrides,
  };
}

// ── captureChannelStrip ─────────────────────────────────────────────

describe('captureChannelStrip', () => {
  it('captures all mixer-relevant properties from a track', () => {
    const track = makeTrack();
    const data = captureChannelStrip(track);

    expect(data.volume).toBe(0.75);
    expect(data.pan).toBe(0);
    expect(data.panMode).toBe('stereo');
    expect(data.eqLowGain).toBe(2);
    expect(data.eqMidGain).toBe(-1);
    expect(data.eqHighGain).toBe(3);
    expect(data.compressorEnabled).toBe(true);
    expect(data.compressorThreshold).toBe(-20);
    expect(data.compressorRatio).toBe(6);
    expect(data.reverbMix).toBe(0.3);
    expect(data.reverbRoomSize).toBe(0.6);
    expect(data.effectsBypassed).toBe(false);
    expect(data.effects).toHaveLength(2);
  });

  it('captures sends without returnTrackId (position-based)', () => {
    const track = makeTrack();
    const data = captureChannelStrip(track);

    expect(data.sends).toEqual([{ amount: 0.5, prePost: 'post' }]);
  });

  it('deep clones effects so mutations do not affect source', () => {
    const track = makeTrack();
    const data = captureChannelStrip(track);

    data.effects[0].enabled = false;
    expect(track.effects![0].enabled).toBe(true);
  });

  it('handles track with no effects or sends', () => {
    const track = makeTrack({ effects: undefined, sends: undefined });
    const data = captureChannelStrip(track);

    expect(data.effects).toEqual([]);
    expect(data.sends).toEqual([]);
  });

  it('handles track with minimal mixer state', () => {
    const track = makeTrack({
      pan: undefined,
      eqLowGain: undefined,
      compressorEnabled: undefined,
      effects: [],
      sends: [],
    });
    const data = captureChannelStrip(track);

    expect(data.pan).toBeUndefined();
    expect(data.eqLowGain).toBeUndefined();
    expect(data.compressorEnabled).toBeUndefined();
  });
});

// ── applyChannelStrip ──────────────────────────────────────────────

describe('applyChannelStrip', () => {
  it('applies all preset properties to a track update', () => {
    const preset = makePreset({
      volume: 0.9,
      pan: -0.5,
      eqLowGain: 4,
      eqMidGain: 2,
      eqHighGain: -3,
      compressorEnabled: true,
      compressorThreshold: -30,
      compressorRatio: 8,
      reverbMix: 0.5,
      reverbRoomSize: 0.7,
      effectsBypassed: false,
      effects: [
        { id: 'fx-1', type: 'reverb', enabled: true, params: { decay: 2, preDelay: 0.02, wet: 0.5 } },
      ],
    });

    const update = applyChannelStrip(preset);

    expect(update.volume).toBe(0.9);
    expect(update.pan).toBe(-0.5);
    expect(update.eqLowGain).toBe(4);
    expect(update.compressorEnabled).toBe(true);
    expect(update.effects).toHaveLength(1);
    expect(update.effects![0].type).toBe('reverb');
  });

  it('keeps volume when keepVolume option is true', () => {
    const preset = makePreset({ volume: 0.9, pan: -0.5 });
    const update = applyChannelStrip(preset, { keepVolume: true });

    expect(update.volume).toBeUndefined();
    expect(update.pan).toBe(-0.5);
  });

  it('applies only EQ when eqOnly option is set', () => {
    const preset = makePreset({
      volume: 0.9,
      eqLowGain: 5,
      eqMidGain: -2,
      eqHighGain: 3,
      compressorEnabled: true,
      effects: [{ id: 'fx-1', type: 'reverb', enabled: true, params: { decay: 2, preDelay: 0.02, wet: 0.5 } }],
    });

    const update = applyChannelStrip(preset, { eqOnly: true });

    expect(update.eqLowGain).toBe(5);
    expect(update.eqMidGain).toBe(-2);
    expect(update.eqHighGain).toBe(3);
    expect(update.volume).toBeUndefined();
    expect(update.compressorEnabled).toBeUndefined();
    expect(update.effects).toBeUndefined();
  });

  it('applies only effects chain when effectsOnly option is set', () => {
    const preset = makePreset({
      volume: 0.9,
      eqLowGain: 5,
      effects: [{ id: 'fx-1', type: 'reverb', enabled: true, params: { decay: 2, preDelay: 0.02, wet: 0.5 } }],
      effectsBypassed: false,
    });

    const update = applyChannelStrip(preset, { effectsOnly: true });

    expect(update.effects).toHaveLength(1);
    expect(update.effectsBypassed).toBe(false);
    expect(update.volume).toBeUndefined();
    expect(update.eqLowGain).toBeUndefined();
  });

  it('applies only compressor when compressorOnly option is set', () => {
    const preset = makePreset({
      compressorEnabled: true,
      compressorThreshold: -24,
      compressorRatio: 4,
      eqLowGain: 5,
    });

    const update = applyChannelStrip(preset, { compressorOnly: true });

    expect(update.compressorEnabled).toBe(true);
    expect(update.compressorThreshold).toBe(-24);
    expect(update.compressorRatio).toBe(4);
    expect(update.eqLowGain).toBeUndefined();
  });

  it('generates new IDs for effects to prevent ID collisions', () => {
    const preset = makePreset({
      effects: [
        { id: 'fx-1', type: 'reverb', enabled: true, params: { decay: 2, preDelay: 0.02, wet: 0.5 } },
      ],
    });

    const update = applyChannelStrip(preset);
    expect(update.effects![0].id).not.toBe('fx-1');
  });
});

// ── Export / Import ─────────────────────────────────────────────────

describe('exportPresetsToJSON', () => {
  it('serializes presets to a valid JSON string', () => {
    const presets = [makePreset({ name: 'Vocal Warmth' }), makePreset({ id: 'preset-2', name: 'Bass Punch' })];
    const json = exportPresetsToJSON(presets);
    const parsed = JSON.parse(json);

    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe('Vocal Warmth');
    expect(parsed[1].name).toBe('Bass Punch');
  });

  it('excludes factory presets from export', () => {
    const presets = [
      makePreset({ name: 'User Preset', isFactory: false }),
      makePreset({ id: 'factory-1', name: 'Factory Preset', isFactory: true }),
    ];
    const json = exportPresetsToJSON(presets);
    const parsed = JSON.parse(json);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('User Preset');
  });
});

describe('importPresetsFromJSON', () => {
  it('parses valid JSON and assigns new IDs', () => {
    const presets = [makePreset({ id: 'old-id', name: 'Imported' })];
    const json = JSON.stringify(presets);
    const imported = importPresetsFromJSON(json);

    expect(imported).toHaveLength(1);
    expect(imported[0].name).toBe('Imported');
    expect(imported[0].id).not.toBe('old-id');
    expect(imported[0].isFactory).toBe(false);
  });

  it('throws on invalid JSON', () => {
    expect(() => importPresetsFromJSON('not json')).toThrow();
  });

  it('throws on non-array JSON', () => {
    expect(() => importPresetsFromJSON('{"name":"oops"}')).toThrow();
  });

  it('filters out entries missing required fields', () => {
    const data = [
      { name: 'Valid', effects: [] },
      { noName: true },
      'not an object',
    ];
    const imported = importPresetsFromJSON(JSON.stringify(data));
    expect(imported).toHaveLength(1);
    expect(imported[0].name).toBe('Valid');
  });
});

// ── localStorage persistence ─────────────────────────────────────────

describe('loadPresetLibrary', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns factory presets when localStorage is empty', () => {
    const presets = loadPresetLibrary();
    const factoryCount = getFactoryPresets().length;
    expect(presets.length).toBe(factoryCount);
    expect(presets.every((p) => p.isFactory)).toBe(true);
  });

  it('loads saved presets from localStorage merged with factory presets', () => {
    const userPreset = makePreset({ id: 'user-1', name: 'My Vocal', isFactory: false });
    localStorage.setItem(CHANNEL_STRIP_PRESETS_KEY, JSON.stringify([userPreset]));

    const presets = loadPresetLibrary();
    const factoryCount = getFactoryPresets().length;

    expect(presets.length).toBe(factoryCount + 1);
    expect(presets.find((p) => p.id === 'user-1')).toBeDefined();
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem(CHANNEL_STRIP_PRESETS_KEY, 'broken!!!');
    const presets = loadPresetLibrary();
    expect(presets.length).toBe(getFactoryPresets().length);
  });
});

describe('savePresetLibrary', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves only non-factory presets to localStorage', () => {
    const factory = makePreset({ id: 'f1', isFactory: true, name: 'Factory' });
    const user = makePreset({ id: 'u1', isFactory: false, name: 'User' });
    savePresetLibrary([factory, user]);

    const stored = JSON.parse(localStorage.getItem(CHANNEL_STRIP_PRESETS_KEY)!);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('u1');
  });
});

// ── Library CRUD ─────────────────────────────────────────────────────

describe('addPresetToLibrary', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('adds a new preset to the library', () => {
    const newPreset = makePreset({ id: 'new-1', name: 'New Preset' });
    const result = addPresetToLibrary(newPreset);

    expect(result.find((p) => p.id === 'new-1')).toBeDefined();
  });

  it('persists the new preset to localStorage', () => {
    const newPreset = makePreset({ id: 'new-1', name: 'New Preset' });
    addPresetToLibrary(newPreset);

    const stored = JSON.parse(localStorage.getItem(CHANNEL_STRIP_PRESETS_KEY)!);
    expect(stored.find((p: ChannelStripPreset) => p.id === 'new-1')).toBeDefined();
  });
});

describe('removePresetFromLibrary', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes a user preset from the library', () => {
    const preset = makePreset({ id: 'user-1', name: 'Remove Me', isFactory: false });
    addPresetToLibrary(preset);
    const result = removePresetFromLibrary('user-1');

    expect(result.find((p) => p.id === 'user-1')).toBeUndefined();
  });

  it('refuses to remove a factory preset', () => {
    const before = loadPresetLibrary();
    const factoryPreset = before.find((p) => p.isFactory);
    if (factoryPreset) {
      const after = removePresetFromLibrary(factoryPreset.id);
      expect(after.find((p) => p.id === factoryPreset.id)).toBeDefined();
    }
  });
});

describe('renamePreset', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renames a user preset', () => {
    const preset = makePreset({ id: 'user-1', name: 'Old Name', isFactory: false });
    addPresetToLibrary(preset);
    const result = renamePreset('user-1', 'New Name');
    const renamed = result.find((p) => p.id === 'user-1');

    expect(renamed?.name).toBe('New Name');
    expect(renamed!.updatedAt).toBeGreaterThanOrEqual(preset.updatedAt);
  });

  it('refuses to rename a factory preset', () => {
    const all = loadPresetLibrary();
    const factoryPreset = all.find((p) => p.isFactory);
    if (factoryPreset) {
      const result = renamePreset(factoryPreset.id, 'Hacked');
      expect(result.find((p) => p.id === factoryPreset.id)?.name).toBe(factoryPreset.name);
    }
  });
});

describe('duplicatePreset', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates a copy with a new ID and " (Copy)" suffix', () => {
    const preset = makePreset({ id: 'src-1', name: 'Original', isFactory: false });
    addPresetToLibrary(preset);
    const result = duplicatePreset('src-1');
    const copy = result.find((p) => p.name === 'Original (Copy)');

    expect(copy).toBeDefined();
    expect(copy!.id).not.toBe('src-1');
    expect(copy!.isFactory).toBe(false);
  });

  it('can duplicate a factory preset into a user preset', () => {
    const all = loadPresetLibrary();
    const factoryPreset = all.find((p) => p.isFactory);
    if (factoryPreset) {
      const result = duplicatePreset(factoryPreset.id);
      const copy = result.find((p) => p.name === `${factoryPreset.name} (Copy)`);

      expect(copy).toBeDefined();
      expect(copy!.isFactory).toBe(false);
    }
  });
});

// ── Factory presets ──────────────────────────────────────────────────

describe('getFactoryPresets', () => {
  it('returns at least 6 factory presets', () => {
    const presets = getFactoryPresets();
    expect(presets.length).toBeGreaterThanOrEqual(6);
  });

  it('all factory presets have isFactory=true', () => {
    const presets = getFactoryPresets();
    expect(presets.every((p) => p.isFactory === true)).toBe(true);
  });

  it('factory presets cover core categories', () => {
    const presets = getFactoryPresets();
    const categories = new Set(presets.map((p) => p.category));
    expect(categories.has('vocal')).toBe(true);
    expect(categories.has('drums')).toBe(true);
    expect(categories.has('bass')).toBe(true);
  });

  it('factory presets have valid effects arrays', () => {
    const presets = getFactoryPresets();
    presets.forEach((p) => {
      expect(Array.isArray(p.effects)).toBe(true);
    });
  });

  it('each factory preset has a unique ID', () => {
    const presets = getFactoryPresets();
    const ids = presets.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
