import { describe, it, expect } from 'vitest';
import type { MidiNote } from '../../src/types/project';
import { extractGroove, applyGroove } from '../../src/utils/groovePool';

function makeNote(overrides: Partial<MidiNote> & { id: string }): MidiNote {
  return { pitch: 60, startBeat: 0, durationBeats: 1, velocity: 80, ...overrides };
}

// ── extractGroove ─────────────────────────────────────────────────────────

describe('extractGroove', () => {
  it('extracts zero offsets from perfectly quantized notes', () => {
    const notes = [
      makeNote({ id: 'a', startBeat: 0, velocity: 80 }),
      makeNote({ id: 'b', startBeat: 0.5, velocity: 80 }),
      makeNote({ id: 'c', startBeat: 1.0, velocity: 80 }),
      makeNote({ id: 'd', startBeat: 1.5, velocity: 80 }),
    ];
    const groove = extractGroove(notes, { gridBeats: 0.5, lengthBeats: 2 });
    expect(groove.timingOffsets).toHaveLength(4);
    expect(groove.timingOffsets.every((o) => Math.abs(o) < 1e-10)).toBe(true);
    expect(groove.velocityPattern.every((v) => Math.abs(v - 1) < 1e-10)).toBe(true);
  });

  it('captures timing offsets from swung notes', () => {
    // Notes on 8th-note grid with swing: odd positions shifted +0.1 beats
    const notes = [
      makeNote({ id: 'a', startBeat: 0, velocity: 80 }),
      makeNote({ id: 'b', startBeat: 0.6, velocity: 80 }), // 0.5 + 0.1
      makeNote({ id: 'c', startBeat: 1.0, velocity: 80 }),
      makeNote({ id: 'd', startBeat: 1.6, velocity: 80 }), // 1.5 + 0.1
    ];
    const groove = extractGroove(notes, { gridBeats: 0.5, lengthBeats: 2 });
    expect(groove.timingOffsets[0]).toBeCloseTo(0, 5);
    expect(groove.timingOffsets[1]).toBeCloseTo(0.1, 5);
    expect(groove.timingOffsets[2]).toBeCloseTo(0, 5);
    expect(groove.timingOffsets[3]).toBeCloseTo(0.1, 5);
  });

  it('captures velocity variations', () => {
    const notes = [
      makeNote({ id: 'a', startBeat: 0, velocity: 100 }),
      makeNote({ id: 'b', startBeat: 0.5, velocity: 60 }),
      makeNote({ id: 'c', startBeat: 1.0, velocity: 100 }),
      makeNote({ id: 'd', startBeat: 1.5, velocity: 60 }),
    ];
    const groove = extractGroove(notes, { gridBeats: 0.5, lengthBeats: 2 });
    // avg velocity = 80
    expect(groove.velocityPattern[0]).toBeCloseTo(100 / 80, 5);
    expect(groove.velocityPattern[1]).toBeCloseTo(60 / 80, 5);
  });

  it('averages multiple notes on the same grid slot', () => {
    // Two notes near beat 0, one early one late
    const notes = [
      makeNote({ id: 'a', startBeat: 0.04, velocity: 80 }),
      makeNote({ id: 'b', startBeat: -0.02 + 2, velocity: 100 }), // startBeat 1.98, wraps to slot 0 in lengthBeats=2
    ];
    // Note a: pos 0.04, slot 0, offset 0.04
    // Note b: pos 1.98, nearest slot = round(1.98/0.5) = 4 % 4 = 0, offset = 1.98 - 0 = 1.98 ... no
    // Let's use notes that clearly land on the same slot
    const notes2 = [
      makeNote({ id: 'a', startBeat: 0.04, velocity: 80 }),
      makeNote({ id: 'b', startBeat: 0.06, velocity: 100 }),
    ];
    // Both on slot 0 (nearest to 0). Offsets: 0.04 and 0.06. avg = 0.05
    const groove = extractGroove(notes2, { gridBeats: 0.5, lengthBeats: 2 });
    expect(groove.timingOffsets[0]).toBeCloseTo(0.05, 5);
    // avg velocity = 90, slot 0 avg vel = 90 → pattern = 1.0
    expect(groove.velocityPattern[0]).toBeCloseTo(1.0, 5);
  });

  it('fills empty grid slots with 0 offset and 1.0 velocity', () => {
    const notes = [makeNote({ id: 'a', startBeat: 0, velocity: 80 })];
    const groove = extractGroove(notes, { gridBeats: 0.5, lengthBeats: 2 });
    // Slots 1, 2, 3 should be defaults
    expect(groove.timingOffsets[1]).toBe(0);
    expect(groove.velocityPattern[1]).toBe(1);
  });

  it('returns correct gridBeats and lengthBeats', () => {
    const groove = extractGroove([], { gridBeats: 0.25, lengthBeats: 4 });
    expect(groove.gridBeats).toBe(0.25);
    expect(groove.lengthBeats).toBe(4);
    expect(groove.timingOffsets).toHaveLength(16);
  });
});

// ── applyGroove ───────────────────────────────────────────────────────────

describe('applyGroove', () => {
  const swungGroove = {
    timingOffsets: [0, 0.1, 0, 0.1],
    velocityPattern: [1.25, 0.75, 1.25, 0.75],
    gridBeats: 0.5,
    lengthBeats: 2,
  };

  it('applies timing offsets at full strength', () => {
    const notes = [
      makeNote({ id: 'a', startBeat: 0 }),
      makeNote({ id: 'b', startBeat: 0.5 }),
      makeNote({ id: 'c', startBeat: 1.0 }),
      makeNote({ id: 'd', startBeat: 1.5 }),
    ];
    const result = applyGroove(notes, swungGroove, { strength: 100 });
    expect(result[0].startBeat).toBeCloseTo(0, 5);
    expect(result[1].startBeat).toBeCloseTo(0.6, 5);
    expect(result[2].startBeat).toBeCloseTo(1.0, 5);
    expect(result[3].startBeat).toBeCloseTo(1.6, 5);
  });

  it('applies velocity pattern at full strength', () => {
    const notes = [
      makeNote({ id: 'a', startBeat: 0, velocity: 80 }),
      makeNote({ id: 'b', startBeat: 0.5, velocity: 80 }),
    ];
    const result = applyGroove(notes, swungGroove, { strength: 100 });
    expect(result[0].velocity).toBe(Math.round(80 * 1.25)); // 100
    expect(result[1].velocity).toBe(Math.round(80 * 0.75)); // 60
  });

  it('does nothing at 0 strength', () => {
    const notes = [
      makeNote({ id: 'a', startBeat: 0.5, velocity: 80 }),
    ];
    const result = applyGroove(notes, swungGroove, { strength: 0 });
    expect(result[0].startBeat).toBe(0.5);
    expect(result[0].velocity).toBe(80);
  });

  it('interpolates at partial strength', () => {
    const notes = [makeNote({ id: 'a', startBeat: 0.5, velocity: 80 })];
    const result = applyGroove(notes, swungGroove, { strength: 50 });
    // Slot 1: offset = 0.1, current offset = 0, delta = 0.1, factor = 0.5 → +0.05
    expect(result[0].startBeat).toBeCloseTo(0.55, 5);
  });

  it('can apply only timing without velocity', () => {
    const notes = [makeNote({ id: 'a', startBeat: 0, velocity: 80 })];
    const result = applyGroove(notes, swungGroove, {
      strength: 100,
      applyTiming: true,
      applyVelocity: false,
    });
    expect(result[0].velocity).toBe(80);
  });

  it('can apply only velocity without timing', () => {
    const notes = [makeNote({ id: 'a', startBeat: 0, velocity: 80 })];
    const result = applyGroove(notes, swungGroove, {
      strength: 100,
      applyTiming: false,
      applyVelocity: true,
    });
    expect(result[0].startBeat).toBe(0);
    expect(result[0].velocity).toBe(100);
  });

  it('clamps velocity to 1–127', () => {
    const loudGroove = {
      timingOffsets: [0],
      velocityPattern: [2.0],
      gridBeats: 1,
      lengthBeats: 1,
    };
    const notes = [makeNote({ id: 'a', startBeat: 0, velocity: 120 })];
    const result = applyGroove(notes, loudGroove, { strength: 100 });
    expect(result[0].velocity).toBeLessThanOrEqual(127);
    expect(result[0].velocity).toBeGreaterThanOrEqual(1);
  });

  it('clamps startBeat to >= 0', () => {
    const negGroove = {
      timingOffsets: [-1],
      velocityPattern: [1],
      gridBeats: 1,
      lengthBeats: 1,
    };
    const notes = [makeNote({ id: 'a', startBeat: 0.2 })];
    const result = applyGroove(notes, negGroove, { strength: 100 });
    expect(result[0].startBeat).toBeGreaterThanOrEqual(0);
  });

  it('does not mutate original notes', () => {
    const notes = [makeNote({ id: 'a', startBeat: 0.5, velocity: 80 })];
    const original = { ...notes[0] };
    applyGroove(notes, swungGroove, { strength: 100 });
    expect(notes[0].startBeat).toBe(original.startBeat);
    expect(notes[0].velocity).toBe(original.velocity);
  });

  it('wraps notes longer than groove length', () => {
    const notes = [
      makeNote({ id: 'a', startBeat: 2.5 }), // wraps to 0.5 in a 2-beat groove → slot 1
    ];
    const result = applyGroove(notes, swungGroove, { strength: 100 });
    // Slot 1 has offset +0.1, note is at 2.5 which is already at offset 0 from slot 1
    expect(result[0].startBeat).toBeCloseTo(2.6, 5);
  });
});

// ── Round-trip: extract then apply ────────────────────────────────────────

describe('round-trip', () => {
  it('applying an extracted groove reproduces the original timing', () => {
    // Original swung notes
    const original = [
      makeNote({ id: 'a', startBeat: 0, velocity: 100 }),
      makeNote({ id: 'b', startBeat: 0.6, velocity: 60 }),
      makeNote({ id: 'c', startBeat: 1.0, velocity: 100 }),
      makeNote({ id: 'd', startBeat: 1.6, velocity: 60 }),
    ];

    // Extract groove
    const groove = extractGroove(original, { gridBeats: 0.5, lengthBeats: 2 });

    // Apply to straight notes
    const straight = [
      makeNote({ id: 'e', startBeat: 0, velocity: 80 }),
      makeNote({ id: 'f', startBeat: 0.5, velocity: 80 }),
      makeNote({ id: 'g', startBeat: 1.0, velocity: 80 }),
      makeNote({ id: 'h', startBeat: 1.5, velocity: 80 }),
    ];

    const result = applyGroove(straight, groove, { strength: 100 });
    expect(result[0].startBeat).toBeCloseTo(0, 5);
    expect(result[1].startBeat).toBeCloseTo(0.6, 5);
    expect(result[2].startBeat).toBeCloseTo(1.0, 5);
    expect(result[3].startBeat).toBeCloseTo(1.6, 5);
  });
});
