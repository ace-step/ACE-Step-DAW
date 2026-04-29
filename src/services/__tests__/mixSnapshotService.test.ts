import { describe, it, expect } from 'vitest';
import {
  captureTrackMixState,
  captureReturnTrackMixState,
  captureMixState,
  applyTrackMixState,
  applyReturnTrackMixState,
  diffTrackMixState,
  diffMixSnapshots,
} from '../mixSnapshotService';
import type {
  Track,
  ReturnTrack,
  Project,
  MixSnapshot,
  MixSnapshotTrackState,
} from '../../types/project';

// ── Fixtures ──────────────────────────────────────────────────────

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    trackName: 'vocals',
    displayName: 'Vocals',
    color: '#ff0000',
    order: 0,
    volume: 0.75,
    muted: false,
    soloed: false,
    clips: [],
    ...overrides,
  };
}

function makeReturnTrack(overrides: Partial<ReturnTrack> = {}): ReturnTrack {
  return {
    id: 'return-1',
    name: 'Return A',
    effects: [],
    volume: 0.8,
    pan: 0,
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    name: 'Test Project',
    createdAt: 1000,
    updatedAt: 1000,
    bpm: 120,
    keyScale: 'C major',
    timeSignature: 4,
    totalDuration: 60,
    tracks: [makeTrack()],
    generationDefaults: {
      inferenceSteps: 60,
      guidanceScale: 15,
      shift: 5,
      thinking: false,
      model: 'default',
    },
    ...overrides,
  };
}

// ── captureTrackMixState ──────────────────────────────────────────

describe('captureTrackMixState', () => {
  it('captures basic mixer fields', () => {
    const track = makeTrack({ volume: 0.6, muted: true, soloed: false, pan: -0.5 });
    const state = captureTrackMixState(track);

    expect(state.trackId).toBe('track-1');
    expect(state.volume).toBe(0.6);
    expect(state.muted).toBe(true);
    expect(state.soloed).toBe(false);
    expect(state.pan).toBe(-0.5);
  });

  it('captures EQ, compressor, and reverb fields', () => {
    const track = makeTrack({
      eqLowGain: 3,
      eqMidGain: -2,
      eqHighGain: 1,
      compressorEnabled: true,
      compressorThreshold: -18,
      compressorRatio: 6,
      reverbMix: 0.3,
      reverbRoomSize: 0.7,
    });
    const state = captureTrackMixState(track);

    expect(state.eqLowGain).toBe(3);
    expect(state.eqMidGain).toBe(-2);
    expect(state.eqHighGain).toBe(1);
    expect(state.compressorEnabled).toBe(true);
    expect(state.compressorThreshold).toBe(-18);
    expect(state.compressorRatio).toBe(6);
    expect(state.reverbMix).toBe(0.3);
    expect(state.reverbRoomSize).toBe(0.7);
  });

  it('captures pan mode settings', () => {
    const track = makeTrack({
      panMode: 'dual-mono',
      panLeft: -1,
      panRight: 1,
    });
    const state = captureTrackMixState(track);

    expect(state.panMode).toBe('dual-mono');
    expect(state.panLeft).toBe(-1);
    expect(state.panRight).toBe(1);
  });

  it('deep-clones effects array', () => {
    const track = makeTrack({
      effects: [{ id: 'fx-1', type: 'eq3', enabled: true, params: { lowGain: 0, midGain: 0, highGain: 0 } }],
    });
    const state = captureTrackMixState(track);

    expect(state.effects).toHaveLength(1);
    expect(state.effects![0].id).toBe('fx-1');
    // Verify deep clone — modifying captured state shouldn't affect original
    state.effects![0].id = 'modified';
    expect(track.effects![0].id).toBe('fx-1');
  });

  it('deep-clones sends array', () => {
    const track = makeTrack({
      sends: [{ returnTrackId: 'return-1', amount: 0.5, prePost: 'post' }],
    });
    const state = captureTrackMixState(track);

    expect(state.sends).toHaveLength(1);
    expect(state.sends![0].amount).toBe(0.5);
    state.sends![0].amount = 0.9;
    expect(track.sends![0].amount).toBe(0.5);
  });

  it('handles tracks with no optional fields', () => {
    const track = makeTrack();
    const state = captureTrackMixState(track);

    expect(state.pan).toBeUndefined();
    expect(state.effects).toEqual([]);
    expect(state.sends).toEqual([]);
    expect(state.effectsBypassed).toBeUndefined();
  });
});

// ── captureReturnTrackMixState ───────────────────────────────────

describe('captureReturnTrackMixState', () => {
  it('captures return track fields', () => {
    const rt = makeReturnTrack({ volume: 0.6, pan: 0.3 });
    const state = captureReturnTrackMixState(rt);

    expect(state.returnTrackId).toBe('return-1');
    expect(state.volume).toBe(0.6);
    expect(state.pan).toBe(0.3);
    expect(state.effects).toEqual([]);
  });

  it('deep-clones return track effects', () => {
    const rt = makeReturnTrack({
      effects: [{ id: 'fx-r1', type: 'reverb', enabled: true, params: { decay: 2, mix: 0.5 } }],
    });
    const state = captureReturnTrackMixState(rt);

    expect(state.effects).toHaveLength(1);
    state.effects[0].id = 'modified';
    expect(rt.effects[0].id).toBe('fx-r1');
  });
});

// ── captureMixState ──────────────────────────────────────────────

describe('captureMixState', () => {
  it('creates snapshot with name and timestamp', () => {
    const project = makeProject();
    const snapshot = captureMixState(project, 'My Mix');

    expect(snapshot.name).toBe('My Mix');
    expect(snapshot.id).toBeTruthy();
    expect(snapshot.createdAt).toBeGreaterThan(0);
  });

  it('captures all tracks', () => {
    const project = makeProject({
      tracks: [
        makeTrack({ id: 't1', volume: 0.5 }),
        makeTrack({ id: 't2', volume: 0.8 }),
      ],
    });
    const snapshot = captureMixState(project, 'Test');

    expect(snapshot.trackStates).toHaveLength(2);
    expect(snapshot.trackStates[0].trackId).toBe('t1');
    expect(snapshot.trackStates[0].volume).toBe(0.5);
    expect(snapshot.trackStates[1].trackId).toBe('t2');
    expect(snapshot.trackStates[1].volume).toBe(0.8);
  });

  it('captures return tracks', () => {
    const project = makeProject({
      returnTracks: [makeReturnTrack({ id: 'rt1', volume: 0.7 })],
    });
    const snapshot = captureMixState(project, 'Test');

    expect(snapshot.returnTrackStates).toHaveLength(1);
    expect(snapshot.returnTrackStates[0].returnTrackId).toBe('rt1');
    expect(snapshot.returnTrackStates[0].volume).toBe(0.7);
  });

  it('captures master volume', () => {
    const project = makeProject({ masterVolume: 0.9 });
    const snapshot = captureMixState(project, 'Test');

    expect(snapshot.masterVolume).toBe(0.9);
  });

  it('handles project with no return tracks', () => {
    const project = makeProject();
    const snapshot = captureMixState(project, 'Test');

    expect(snapshot.returnTrackStates).toEqual([]);
  });
});

// ── applyTrackMixState ───────────────────────────────────────────

describe('applyTrackMixState', () => {
  it('applies volume, mute, solo, pan', () => {
    const track = makeTrack({ volume: 0.5, muted: false, soloed: false, pan: 0 });
    const state: MixSnapshotTrackState = {
      trackId: 'track-1',
      volume: 0.8,
      muted: true,
      soloed: true,
      pan: -0.3,
    };

    const result = applyTrackMixState(track, state);

    expect(result.volume).toBe(0.8);
    expect(result.muted).toBe(true);
    expect(result.soloed).toBe(true);
    expect(result.pan).toBe(-0.3);
  });

  it('preserves non-mixer fields', () => {
    const track = makeTrack({ displayName: 'Lead Vocal', color: '#ff0000', order: 3 });
    const state: MixSnapshotTrackState = {
      trackId: 'track-1',
      volume: 0.9,
      muted: false,
      soloed: false,
    };

    const result = applyTrackMixState(track, state);

    expect(result.displayName).toBe('Lead Vocal');
    expect(result.color).toBe('#ff0000');
    expect(result.order).toBe(3);
  });

  it('applies EQ and compressor settings', () => {
    const track = makeTrack();
    const state: MixSnapshotTrackState = {
      trackId: 'track-1',
      volume: 0.75,
      muted: false,
      soloed: false,
      eqLowGain: 5,
      eqMidGain: -3,
      eqHighGain: 2,
      compressorEnabled: true,
      compressorThreshold: -20,
      compressorRatio: 8,
    };

    const result = applyTrackMixState(track, state);

    expect(result.eqLowGain).toBe(5);
    expect(result.eqMidGain).toBe(-3);
    expect(result.eqHighGain).toBe(2);
    expect(result.compressorEnabled).toBe(true);
    expect(result.compressorThreshold).toBe(-20);
    expect(result.compressorRatio).toBe(8);
  });

  it('deep-clones effects from snapshot', () => {
    const track = makeTrack();
    const state: MixSnapshotTrackState = {
      trackId: 'track-1',
      volume: 0.75,
      muted: false,
      soloed: false,
      effects: [{ id: 'fx-1', type: 'reverb', enabled: true, params: { decay: 3, mix: 0.4 } }],
    };

    const result = applyTrackMixState(track, state);
    expect(result.effects).toHaveLength(1);
    // Verify deep clone
    result.effects![0].id = 'modified';
    expect(state.effects![0].id).toBe('fx-1');
  });

  it('clears effects and sends when the snapshot explicitly stores empty collections', () => {
    const track = makeTrack({
      effects: [{ id: 'fx-1', type: 'reverb', enabled: true, params: { decay: 3, mix: 0.4 } }],
      sends: [{ returnTrackId: 'return-1', amount: 0.6, prePost: 'post' }],
    });
    const state: MixSnapshotTrackState = {
      trackId: 'track-1',
      volume: 0.75,
      muted: false,
      soloed: false,
      effects: [],
      sends: [],
    };

    const result = applyTrackMixState(track, state);

    expect(result.effects).toEqual([]);
    expect(result.sends).toEqual([]);
  });

  it('preserves effects and sends when an older snapshot omits those fields', () => {
    const track = makeTrack({
      effects: [{ id: 'fx-1', type: 'reverb', enabled: true, params: { decay: 3, mix: 0.4 } }],
      sends: [{ returnTrackId: 'return-1', amount: 0.6, prePost: 'post' }],
    });
    const state: MixSnapshotTrackState = {
      trackId: 'track-1',
      volume: 0.75,
      muted: false,
      soloed: false,
    };

    const result = applyTrackMixState(track, state);

    expect(result.effects).toBe(track.effects);
    expect(result.sends).toBe(track.sends);
  });

  it('can reuse snapshot collection references when cloning is disabled', () => {
    const track = makeTrack();
    const state: MixSnapshotTrackState = {
      trackId: 'track-1',
      volume: 0.75,
      muted: false,
      soloed: false,
      effects: [{ id: 'fx-1', type: 'reverb', enabled: true, params: { decay: 3, mix: 0.4 } }],
      sends: [{ returnTrackId: 'return-1', amount: 0.6, prePost: 'post' }],
    };

    const result = applyTrackMixState(track, state, { cloneCollections: false });

    expect(result.effects).toBe(state.effects);
    expect(result.sends).toBe(state.sends);
  });
});

// ── applyReturnTrackMixState ─────────────────────────────────────

describe('applyReturnTrackMixState', () => {
  it('applies volume, pan, and effects', () => {
    const rt = makeReturnTrack({ volume: 0.5, pan: 0 });
    const state = { returnTrackId: 'return-1', volume: 0.9, pan: 0.5, effects: [] as ReturnTrack['effects'] };

    const result = applyReturnTrackMixState(rt, state);

    expect(result.volume).toBe(0.9);
    expect(result.pan).toBe(0.5);
  });

  it('preserves return track name', () => {
    const rt = makeReturnTrack({ name: 'Reverb Bus' });
    const state = { returnTrackId: 'return-1', volume: 0.7, pan: 0, effects: [] as ReturnTrack['effects'] };

    const result = applyReturnTrackMixState(rt, state);
    expect(result.name).toBe('Reverb Bus');
  });
});

// ── diffTrackMixState ────────────────────────────────────────────

describe('diffTrackMixState', () => {
  it('reports no changes for identical states', () => {
    const state: MixSnapshotTrackState = {
      trackId: 'track-1',
      volume: 0.75,
      muted: false,
      soloed: false,
      pan: 0,
    };

    const diff = diffTrackMixState(state, { ...state });
    expect(diff.changed).toBe(false);
    expect(diff.fields).toEqual([]);
  });

  it('detects volume change', () => {
    const a: MixSnapshotTrackState = { trackId: 't1', volume: 0.5, muted: false, soloed: false };
    const b: MixSnapshotTrackState = { trackId: 't1', volume: 0.8, muted: false, soloed: false };

    const diff = diffTrackMixState(a, b);
    expect(diff.changed).toBe(true);
    expect(diff.fields).toContain('volume');
  });

  it('detects mute/solo changes', () => {
    const a: MixSnapshotTrackState = { trackId: 't1', volume: 0.5, muted: false, soloed: false };
    const b: MixSnapshotTrackState = { trackId: 't1', volume: 0.5, muted: true, soloed: true };

    const diff = diffTrackMixState(a, b);
    expect(diff.changed).toBe(true);
    expect(diff.fields).toContain('muted');
    expect(diff.fields).toContain('soloed');
  });

  it('detects EQ changes', () => {
    const a: MixSnapshotTrackState = { trackId: 't1', volume: 0.5, muted: false, soloed: false, eqLowGain: 0 };
    const b: MixSnapshotTrackState = { trackId: 't1', volume: 0.5, muted: false, soloed: false, eqLowGain: 3 };

    const diff = diffTrackMixState(a, b);
    expect(diff.changed).toBe(true);
    expect(diff.fields).toContain('eqLowGain');
  });

  it('detects effects chain changes', () => {
    const a: MixSnapshotTrackState = {
      trackId: 't1', volume: 0.5, muted: false, soloed: false,
      effects: [{ id: 'fx1', type: 'eq3', enabled: true, params: { lowGain: 0, midGain: 0, highGain: 0 } }],
    };
    const b: MixSnapshotTrackState = {
      trackId: 't1', volume: 0.5, muted: false, soloed: false,
      effects: [],
    };

    const diff = diffTrackMixState(a, b);
    expect(diff.changed).toBe(true);
    expect(diff.fields).toContain('effects');
  });

  it('detects send changes', () => {
    const a: MixSnapshotTrackState = {
      trackId: 't1', volume: 0.5, muted: false, soloed: false,
      sends: [{ returnTrackId: 'r1', amount: 0.5, prePost: 'post' }],
    };
    const b: MixSnapshotTrackState = {
      trackId: 't1', volume: 0.5, muted: false, soloed: false,
      sends: [{ returnTrackId: 'r1', amount: 0.8, prePost: 'post' }],
    };

    const diff = diffTrackMixState(a, b);
    expect(diff.changed).toBe(true);
    expect(diff.fields).toContain('sends');
  });

  it('reports multiple changed fields', () => {
    const a: MixSnapshotTrackState = { trackId: 't1', volume: 0.5, muted: false, soloed: false, pan: 0 };
    const b: MixSnapshotTrackState = { trackId: 't1', volume: 0.8, muted: true, soloed: false, pan: -0.5 };

    const diff = diffTrackMixState(a, b);
    expect(diff.changed).toBe(true);
    expect(diff.fields).toContain('volume');
    expect(diff.fields).toContain('muted');
    expect(diff.fields).toContain('pan');
    expect(diff.fields).not.toContain('soloed');
  });
});

// ── diffMixSnapshots ─────────────────────────────────────────────

describe('diffMixSnapshots', () => {
  it('reports no changes for identical project and snapshot', () => {
    const project = makeProject({
      tracks: [makeTrack({ id: 't1', volume: 0.5 })],
    });
    const snapshot: MixSnapshot = {
      id: 'snap-1',
      name: 'Test',
      createdAt: Date.now(),
      trackStates: [{ trackId: 't1', volume: 0.5, muted: false, soloed: false }],
      returnTrackStates: [],
    };

    const diffs = diffMixSnapshots(project, snapshot);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].changed).toBe(false);
  });

  it('detects changes between project and snapshot', () => {
    const project = makeProject({
      tracks: [makeTrack({ id: 't1', volume: 0.8 })],
    });
    const snapshot: MixSnapshot = {
      id: 'snap-1',
      name: 'Test',
      createdAt: Date.now(),
      trackStates: [{ trackId: 't1', volume: 0.5, muted: false, soloed: false }],
      returnTrackStates: [],
    };

    const diffs = diffMixSnapshots(project, snapshot);
    expect(diffs[0].changed).toBe(true);
    expect(diffs[0].fields).toContain('volume');
  });

  it('marks new tracks as changed', () => {
    const project = makeProject({
      tracks: [
        makeTrack({ id: 't1', volume: 0.5 }),
        makeTrack({ id: 't2', volume: 0.7 }),
      ],
    });
    const snapshot: MixSnapshot = {
      id: 'snap-1',
      name: 'Test',
      createdAt: Date.now(),
      trackStates: [{ trackId: 't1', volume: 0.5, muted: false, soloed: false }],
      returnTrackStates: [],
    };

    const diffs = diffMixSnapshots(project, snapshot);
    expect(diffs).toHaveLength(2);
    expect(diffs[1].trackId).toBe('t2');
    expect(diffs[1].changed).toBe(true);
    expect(diffs[1].fields).toContain('new-track');
  });
});
