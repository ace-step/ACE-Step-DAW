import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { resolveFocusedTrackId } from '../focusResolution';
import type { Track, Clip } from '../../types/project';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeClip(id: string): Clip {
  return {
    id,
    name: `Clip ${id}`,
    startTime: 0,
    duration: 4,
    color: '#aaa',
  } as Clip;
}

function makeTrack(id: string, clips: Clip[] = []): Track {
  return {
    id,
    trackName: 'drums',
    displayName: `Track ${id}`,
    color: '#ff0000',
    order: 0,
    volume: 0.8,
    muted: false,
    soloed: false,
    clips,
    effects: [],
  } as Track;
}

function setProject(tracks: Track[]) {
  useProjectStore.setState({
    project: {
      id: 'project-1',
      name: 'Test',
      bpm: 120,
      tracks,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as ReturnType<typeof useProjectStore.getState>['project'],
  });
}

function resetUI(overrides: Record<string, unknown> = {}) {
  useUIStore.setState({
    keyboardContext: { scope: 'timeline', trackId: null },
    openPianoRollTrackId: null,
    openSequencerTrackId: null,
    openDrumMachineTrackId: null,
    expandedTrackId: null,
    selectedClipIds: new Set<string>(),
    ...overrides,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('resolveFocusedTrackId', () => {
  beforeEach(() => {
    resetUI();
  });

  // ── null / empty edge cases ─────────────────────────────────────────────

  it('returns null when project is null', () => {
    useProjectStore.setState({ project: null });
    expect(resolveFocusedTrackId()).toBe(null);
  });

  it('returns null when project has zero tracks and no focus hints', () => {
    setProject([]);
    expect(resolveFocusedTrackId()).toBe(null);
  });

  // ── fallback to first track ─────────────────────────────────────────────

  it('falls back to the first track id when no focus hints are set', () => {
    const t1 = makeTrack('t-1');
    const t2 = makeTrack('t-2');
    setProject([t1, t2]);
    expect(resolveFocusedTrackId()).toBe('t-1');
  });

  // ── keyboardContext.trackId (highest priority) ──────────────────────────

  it('returns keyboardContext.trackId when it exists in the project', () => {
    setProject([makeTrack('t-1'), makeTrack('t-2')]);
    resetUI({ keyboardContext: { scope: 'pianoRoll', trackId: 't-2' } });
    expect(resolveFocusedTrackId()).toBe('t-2');
  });

  it('ignores keyboardContext.trackId when it does NOT exist in the project', () => {
    setProject([makeTrack('t-1')]);
    resetUI({ keyboardContext: { scope: 'pianoRoll', trackId: 'deleted-track' } });
    // Falls through to first track
    expect(resolveFocusedTrackId()).toBe('t-1');
  });

  it('ignores keyboardContext when trackId is null', () => {
    setProject([makeTrack('t-1')]);
    resetUI({ keyboardContext: { scope: 'timeline', trackId: null } });
    expect(resolveFocusedTrackId()).toBe('t-1');
  });

  // ── editor panel track ids (second priority tier) ───────────────────────

  it('returns openPianoRollTrackId when keyboardContext has no trackId', () => {
    setProject([makeTrack('t-1'), makeTrack('t-piano')]);
    resetUI({ openPianoRollTrackId: 't-piano' });
    expect(resolveFocusedTrackId()).toBe('t-piano');
  });

  it('returns openSequencerTrackId when piano roll is not open', () => {
    setProject([makeTrack('t-1'), makeTrack('t-seq')]);
    resetUI({ openSequencerTrackId: 't-seq' });
    expect(resolveFocusedTrackId()).toBe('t-seq');
  });

  it('returns openDrumMachineTrackId when sequencer and piano roll are not open', () => {
    setProject([makeTrack('t-1'), makeTrack('t-drum')]);
    resetUI({ openDrumMachineTrackId: 't-drum' });
    expect(resolveFocusedTrackId()).toBe('t-drum');
  });

  it('returns expandedTrackId when no editor panels are open', () => {
    setProject([makeTrack('t-1'), makeTrack('t-exp')]);
    resetUI({ expandedTrackId: 't-exp' });
    expect(resolveFocusedTrackId()).toBe('t-exp');
  });

  it('prefers openPianoRollTrackId over openSequencerTrackId', () => {
    setProject([makeTrack('t-piano'), makeTrack('t-seq')]);
    resetUI({
      openPianoRollTrackId: 't-piano',
      openSequencerTrackId: 't-seq',
    });
    expect(resolveFocusedTrackId()).toBe('t-piano');
  });

  it('prefers openSequencerTrackId over openDrumMachineTrackId', () => {
    setProject([makeTrack('t-seq'), makeTrack('t-drum')]);
    resetUI({
      openSequencerTrackId: 't-seq',
      openDrumMachineTrackId: 't-drum',
    });
    expect(resolveFocusedTrackId()).toBe('t-seq');
  });

  it('prefers openDrumMachineTrackId over expandedTrackId', () => {
    setProject([makeTrack('t-drum'), makeTrack('t-exp')]);
    resetUI({
      openDrumMachineTrackId: 't-drum',
      expandedTrackId: 't-exp',
    });
    expect(resolveFocusedTrackId()).toBe('t-drum');
  });

  it('ignores editor panel trackId when it is not in the project', () => {
    setProject([makeTrack('t-1')]);
    resetUI({ openPianoRollTrackId: 'deleted-piano-track' });
    // Falls through to first track
    expect(resolveFocusedTrackId()).toBe('t-1');
  });

  // ── selectedClipIds (third priority tier) ───────────────────────────────

  it('returns track id that owns a selected clip', () => {
    const clip = makeClip('clip-a');
    const t1 = makeTrack('t-1');
    const t2 = makeTrack('t-2', [clip]);
    setProject([t1, t2]);
    resetUI({ selectedClipIds: new Set(['clip-a']) });
    expect(resolveFocusedTrackId()).toBe('t-2');
  });

  it('returns the first track that owns any selected clip when clips span multiple tracks', () => {
    const clipA = makeClip('clip-a');
    const clipB = makeClip('clip-b');
    const t1 = makeTrack('t-1', [clipA]);
    const t2 = makeTrack('t-2', [clipB]);
    setProject([t1, t2]);
    resetUI({ selectedClipIds: new Set(['clip-a', 'clip-b']) });
    // First track in project order that has a matching clip
    expect(resolveFocusedTrackId()).toBe('t-1');
  });

  it('ignores selectedClipIds that do not belong to any track', () => {
    setProject([makeTrack('t-1')]);
    resetUI({ selectedClipIds: new Set(['orphan-clip']) });
    // Falls through to first track
    expect(resolveFocusedTrackId()).toBe('t-1');
  });

  it('skips empty selectedClipIds set and falls back to first track', () => {
    setProject([makeTrack('t-1')]);
    resetUI({ selectedClipIds: new Set() });
    expect(resolveFocusedTrackId()).toBe('t-1');
  });

  // ── priority ordering across tiers ──────────────────────────────────────

  it('keyboardContext takes priority over editor panels', () => {
    setProject([makeTrack('t-kb'), makeTrack('t-piano')]);
    resetUI({
      keyboardContext: { scope: 'pianoRoll', trackId: 't-kb' },
      openPianoRollTrackId: 't-piano',
    });
    expect(resolveFocusedTrackId()).toBe('t-kb');
  });

  it('editor panels take priority over selectedClipIds', () => {
    const clip = makeClip('clip-a');
    const t1 = makeTrack('t-seq');
    const t2 = makeTrack('t-clip', [clip]);
    setProject([t1, t2]);
    resetUI({
      openSequencerTrackId: 't-seq',
      selectedClipIds: new Set(['clip-a']),
    });
    expect(resolveFocusedTrackId()).toBe('t-seq');
  });

  it('selectedClipIds takes priority over first-track fallback', () => {
    const clip = makeClip('clip-x');
    const t1 = makeTrack('t-1');
    const t2 = makeTrack('t-2', [clip]);
    setProject([t1, t2]);
    resetUI({ selectedClipIds: new Set(['clip-x']) });
    expect(resolveFocusedTrackId()).toBe('t-2');
  });

  // ── stale references (track removed from project) ──────────────────────

  it('falls through all tiers when every referenced track id is stale', () => {
    setProject([makeTrack('t-only')]);
    resetUI({
      keyboardContext: { scope: 'pianoRoll', trackId: 'gone-1' },
      openPianoRollTrackId: 'gone-2',
      openSequencerTrackId: 'gone-3',
      openDrumMachineTrackId: 'gone-4',
      expandedTrackId: 'gone-5',
      selectedClipIds: new Set(['gone-clip']),
    });
    expect(resolveFocusedTrackId()).toBe('t-only');
  });
});
