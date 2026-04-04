import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  detectAutomationLfoConflicts,
  type AutomationLfoConflict,
} from '../automationLfoConflict';
import type { AutomationLane, Track, TrackEffect } from '../../types/project';

function makeFilterEffect(lfoEnabled = true): TrackEffect {
  return {
    id: 'fx-filter-1',
    type: 'filter',
    enabled: true,
    params: {
      frequency: 1000,
      resonance: 1,
      filterType: 'lowpass',
      lfoEnabled,
      lfoRate: 2,
      lfoDepth: 0.5,
    },
  } as TrackEffect;
}

function makeFlangerEffect(): TrackEffect {
  return {
    id: 'fx-flanger-1',
    type: 'flanger',
    enabled: true,
    params: {
      frequency: 0.5,
      delayTime: 3,
      depth: 0.7,
      feedback: 0.5,
      wet: 0.5,
    },
  } as TrackEffect;
}

function makeAutomationLane(
  trackId: string,
  effectId: string,
  effectType: string,
  param: string,
): AutomationLane {
  return {
    id: `lane-${effectId}-${param}`,
    trackId,
    parameter: {
      type: 'effect',
      effectId,
      effectType,
      param,
    } as AutomationLane['parameter'],
    points: [
      { time: 0, value: 0.3 },
      { time: 4, value: 0.8 },
    ],
    color: '#ff0000',
  };
}

function makeTrack(effects: TrackEffect[]): Track {
  return {
    id: 'track-1',
    trackName: 'vocals' as const,
    displayName: 'Test Track',
    color: '#fff',
    order: 0,
    volume: 1,
    muted: false,
    soloed: false,
    clips: [],
    effects,
  } as Track;
}

describe('detectAutomationLfoConflicts', () => {
  it('detects conflict when filter LFO is enabled and frequency is automated', () => {
    const track = makeTrack([makeFilterEffect(true)]);
    const lanes = [makeAutomationLane('track-1', 'fx-filter-1', 'filter', 'frequency')];
    const conflicts = detectAutomationLfoConflicts(track, lanes);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toEqual({
      trackId: 'track-1',
      effectId: 'fx-filter-1',
      effectType: 'filter',
      param: 'frequency',
      lfoSource: 'effect-lfo',
    });
  });

  it('returns no conflicts when filter LFO is disabled', () => {
    const track = makeTrack([makeFilterEffect(false)]);
    const lanes = [makeAutomationLane('track-1', 'fx-filter-1', 'filter', 'frequency')];
    const conflicts = detectAutomationLfoConflicts(track, lanes);
    expect(conflicts).toHaveLength(0);
  });

  it('returns no conflicts when filter LFO is enabled but frequency is not automated', () => {
    const track = makeTrack([makeFilterEffect(true)]);
    const lanes = [makeAutomationLane('track-1', 'fx-filter-1', 'filter', 'resonance')];
    const conflicts = detectAutomationLfoConflicts(track, lanes);
    expect(conflicts).toHaveLength(0);
  });

  it('detects conflict when flanger has automation on delayTime (LFO always active)', () => {
    const track = makeTrack([makeFlangerEffect()]);
    const lanes = [makeAutomationLane('track-1', 'fx-flanger-1', 'flanger', 'delayTime')];
    const conflicts = detectAutomationLfoConflicts(track, lanes);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].effectType).toBe('flanger');
    expect(conflicts[0].param).toBe('delayTime');
  });

  it('returns no conflicts for effects without LFOs (e.g. reverb)', () => {
    const track = makeTrack([{
      id: 'fx-reverb',
      type: 'reverb',
      enabled: true,
      params: { decay: 2, preDelay: 0.01, wet: 0.3 },
    } as TrackEffect]);
    const lanes = [makeAutomationLane('track-1', 'fx-reverb', 'reverb', 'wet')];
    const conflicts = detectAutomationLfoConflicts(track, lanes);
    expect(conflicts).toHaveLength(0);
  });

  it('returns empty array when no automation lanes exist', () => {
    const track = makeTrack([makeFilterEffect(true)]);
    const conflicts = detectAutomationLfoConflicts(track, []);
    expect(conflicts).toHaveLength(0);
  });

  it('handles multiple conflicts from different effects', () => {
    const track = makeTrack([makeFilterEffect(true), makeFlangerEffect()]);
    const lanes = [
      makeAutomationLane('track-1', 'fx-filter-1', 'filter', 'frequency'),
      makeAutomationLane('track-1', 'fx-flanger-1', 'flanger', 'delayTime'),
    ];
    const conflicts = detectAutomationLfoConflicts(track, lanes);
    expect(conflicts).toHaveLength(2);
  });
});
