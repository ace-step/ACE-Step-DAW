/**
 * Gate 0: Strudel Transport Sync Spike
 *
 * Tests that Strudel patterns can be evaluated and queried for events
 * without running Strudel's own scheduler. This proves the "hybrid" approach:
 * - Strudel evaluates patterns (pure function via queryArc)
 * - Tone.js Transport schedules the events (master clock)
 * - No competing schedulers, no drift risk
 *
 * Acceptance criteria:
 * - Pattern evaluation produces correct events
 * - queryArc returns events for arbitrary time ranges
 * - BPM ↔ CPS conversion is accurate
 * - Pattern events can be mapped to MIDI-compatible format
 */
import { describe, it, expect, vi } from 'vitest';

// Stub @kabelsalat/web — broken export in v0.4.1, not needed for pattern evaluation
vi.mock('@kabelsalat/web', () => ({
  SalatRepl: class { constructor() {} evaluate() { return {}; } stop() {} },
  exportModule: () => {},
}));

describe('Gate 0: Strudel Transport Sync Spike', () => {
  async function loadStrudel() {
    const { mini } = await import('@strudel/mini');
    return { mini };
  }

  it('evaluates a mini-notation pattern and returns haps via queryArc', async () => {
    const { mini } = await loadStrudel();

    // Parse a simple 4-on-the-floor kick pattern
    const pattern = mini('bd sd bd sd');

    // Query one full cycle (cycle 0 to 1)
    const haps = pattern.queryArc(0, 1);

    // Should produce 4 events in one cycle
    const onsets = haps.filter((h: any) => h.hasOnset());
    expect(onsets.length).toBe(4);

    // Each event should have correct timing within the cycle
    const times = onsets.map((h: any) => h.whole.begin.valueOf());
    expect(times).toEqual([0, 0.25, 0.5, 0.75]);
  });

  it('can query multiple cycles', async () => {
    const { mini } = await loadStrudel();

    const pattern = mini('bd sd');

    // Query 4 cycles
    const haps = pattern.queryArc(0, 4);
    const onsets = haps.filter((h: any) => h.hasOnset());

    // 2 events per cycle × 4 cycles = 8
    expect(onsets.length).toBe(8);
  });

  it('handles complex patterns with nested subdivisions', async () => {
    const { mini } = await loadStrudel();

    // Pattern with subdivision: "bd [sd hh]" = bd takes half, sd+hh split the other half
    const pattern = mini('bd [sd hh]');

    const haps = pattern.queryArc(0, 1);
    const onsets = haps.filter((h: any) => h.hasOnset());

    // 3 events: bd at 0, sd at 0.5, hh at 0.75
    expect(onsets.length).toBe(3);
    const times = onsets.map((h: any) => h.whole.begin.valueOf());
    expect(times[0]).toBeCloseTo(0, 5);
    expect(times[1]).toBeCloseTo(0.5, 5);
    expect(times[2]).toBeCloseTo(0.75, 5);
  });

  it('extracts sound name from hap value', async () => {
    const { mini } = await loadStrudel();

    const pattern = mini('bd sd hh cp');

    const haps = pattern.queryArc(0, 1);
    const onsets = haps.filter((h: any) => h.hasOnset());

    // Each hap's value should contain the sound name
    const sounds = onsets.map((h: any) => {
      const v = h.value;
      return typeof v === 'object' ? (v.s ?? v.value ?? String(v)) : String(v);
    });
    expect(sounds).toEqual(['bd', 'sd', 'hh', 'cp']);
  });

  it('converts BPM to CPS correctly', () => {
    // CPS = cycles per second
    // In 4/4 time: 1 cycle = 1 bar = 4 beats
    // BPM 120 = 120 beats/min = 2 beats/sec = 0.5 bars/sec = 0.5 CPS
    const bpmToCps = (bpm: number, beatsPerCycle: number = 4) => bpm / 60 / beatsPerCycle;

    expect(bpmToCps(120)).toBeCloseTo(0.5, 5);
    expect(bpmToCps(60)).toBeCloseTo(0.25, 5);
    expect(bpmToCps(140)).toBeCloseTo(140 / 60 / 4, 5);
    expect(bpmToCps(90)).toBeCloseTo(90 / 60 / 4, 5);
  });

  it('maps cycle time to seconds using CPS', () => {
    // Given cycle time from queryArc, convert to seconds for Tone.js scheduling
    const cycleTimeToSeconds = (cycleTime: number, cps: number) => cycleTime / cps;

    // At 120 BPM (CPS=0.5): cycle 0 = 0s, cycle 0.25 = 0.5s, cycle 1 = 2s
    const cps = 0.5;
    expect(cycleTimeToSeconds(0, cps)).toBe(0);
    expect(cycleTimeToSeconds(0.25, cps)).toBe(0.5);
    expect(cycleTimeToSeconds(0.5, cps)).toBe(1);
    expect(cycleTimeToSeconds(1, cps)).toBe(2);
  });

  it('can extract pattern info for getStrudelPatternInfo API', async () => {
    const { mini } = await loadStrudel();

    const pattern = mini('bd sd [hh hh hh] cp');

    const haps = pattern.queryArc(0, 1);
    const onsets = haps.filter((h: any) => h.hasOnset());

    // Extract info that getStrudelPatternInfo would return
    const instruments = [...new Set(onsets.map((h: any) => {
      const v = h.value;
      return typeof v === 'object' ? (v.s ?? v.value ?? String(v)) : String(v);
    }))];

    expect(onsets.length).toBeGreaterThanOrEqual(4); // bd, sd, 3×hh, cp
    expect(instruments).toContain('bd');
    expect(instruments).toContain('sd');
    expect(instruments).toContain('hh');
    expect(instruments).toContain('cp');
  });

  it('queryArc is idempotent (same input → same output)', async () => {
    const { mini } = await loadStrudel();

    const pattern = mini('bd sd bd sd');

    const haps1 = pattern.queryArc(0, 1);
    const haps2 = pattern.queryArc(0, 1);

    const times1 = haps1.filter((h: any) => h.hasOnset()).map((h: any) => h.whole.begin.valueOf());
    const times2 = haps2.filter((h: any) => h.hasOnset()).map((h: any) => h.whole.begin.valueOf());

    expect(times1).toEqual(times2);
  });

  it('supports note patterns for melodic content detection', async () => {
    const { mini } = await loadStrudel();

    // Note pattern uses numbers
    const pattern = mini('60 62 64 67');

    const haps = pattern.queryArc(0, 1);
    const onsets = haps.filter((h: any) => h.hasOnset());

    expect(onsets.length).toBe(4);
  });

  it('handles empty pattern gracefully', async () => {
    const { mini } = await loadStrudel();

    const pattern = mini('~'); // silence

    const haps = pattern.queryArc(0, 1);
    const onsets = haps.filter((h: any) => h.hasOnset());

    expect(onsets.length).toBe(0);
  });
});
