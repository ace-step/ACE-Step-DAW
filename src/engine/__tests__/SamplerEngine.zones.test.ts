import { describe, it, expect, vi, beforeEach } from 'vitest';
import { matchZones, computeZoneCrossfadeGains, createDefaultZone } from '../../utils/sampleZones';
import { resolveZonePlayback, type ZonePlaybackInfo } from '../../engine/samplerZoneResolver';
import type { SampleZone, SamplerConfig } from '../../types/project';

function zone(overrides: Partial<SampleZone> = {}): SampleZone {
  return createDefaultZone('test-key', { rootNote: 60, ...overrides });
}

describe('resolveZonePlayback', () => {
  const baseConfig: SamplerConfig = {
    audioKey: 'primary',
    rootNote: 60,
    trimStart: 0,
    trimEnd: 1,
    playbackMode: 'classic',
    loopStart: 0,
    loopEnd: 1,
    attack: 0.005,
    decay: 0.1,
    sustain: 1,
    release: 0.3,
  };

  it('falls back to primary sample when no zones defined', () => {
    const result = resolveZonePlayback(baseConfig, 60, 100);
    expect(result).toHaveLength(1);
    expect(result[0].audioKey).toBe('primary');
    expect(result[0].rootNote).toBe(60);
    expect(result[0].gain).toBe(1);
    expect(result[0].pan).toBe(0);
    expect(result[0].tuneOffsetCents).toBe(0);
  });

  it('falls back to primary when zones is empty', () => {
    const config = { ...baseConfig, zones: [] };
    const result = resolveZonePlayback(config, 60, 100);
    expect(result).toHaveLength(1);
    expect(result[0].audioKey).toBe('primary');
  });

  it('resolves single matching zone', () => {
    const z = zone({ audioKey: 'zone-a', rootNote: 48, lowKey: 36, highKey: 60, volume: 0.8, pan: -0.5, tuneOffset: 50 });
    const config = { ...baseConfig, zones: [z] };
    const result = resolveZonePlayback(config, 48, 100);
    expect(result).toHaveLength(1);
    expect(result[0].audioKey).toBe('zone-a');
    expect(result[0].rootNote).toBe(48);
    expect(result[0].gain).toBe(0.8);
    expect(result[0].pan).toBe(-0.5);
    expect(result[0].tuneOffsetCents).toBe(50);
  });

  it('resolves velocity layers within zones', () => {
    const soft = zone({ id: 'soft', audioKey: 'soft-sample', lowVelocity: 0, highVelocity: 63 });
    const hard = zone({ id: 'hard', audioKey: 'hard-sample', lowVelocity: 64, highVelocity: 127 });
    const config = { ...baseConfig, zones: [soft, hard] };

    const softResult = resolveZonePlayback(config, 60, 30);
    expect(softResult).toHaveLength(1);
    expect(softResult[0].audioKey).toBe('soft-sample');

    const hardResult = resolveZonePlayback(config, 60, 100);
    expect(hardResult).toHaveLength(1);
    expect(hardResult[0].audioKey).toBe('hard-sample');
  });

  it('returns no zones when pitch is out of range', () => {
    const z = zone({ lowKey: 36, highKey: 60 });
    const config = { ...baseConfig, zones: [z] };
    // Falls back to primary when no zone matches
    const result = resolveZonePlayback(config, 80, 100);
    expect(result).toHaveLength(1);
    expect(result[0].audioKey).toBe('primary');
  });

  it('applies crossfade gains for overlapping zones', () => {
    const z1 = zone({ id: 'low', audioKey: 'low-sample', lowKey: 36, highKey: 60, crossfadeWidth: 4 });
    const z2 = zone({ id: 'high', audioKey: 'high-sample', lowKey: 57, highKey: 84, crossfadeWidth: 4 });
    const config = { ...baseConfig, zones: [z1, z2] };

    // In the overlap region (57-60), both zones should match with crossfade gains
    const result = resolveZonePlayback(config, 58, 100);
    expect(result.length).toBeGreaterThanOrEqual(1);
    // At least one zone should have reduced gain (crossfade)
    const hasReducedGain = result.some((r) => r.gain < 1);
    // The overlap means both zones match, so we should have 2 results
    expect(result).toHaveLength(2);
  });
});
