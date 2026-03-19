import { describe, expect, it } from 'vitest';
import {
  normalizeMidiVelocity,
  velocityToBarColor,
  velocityToColor,
} from '../../src/components/pianoroll/PianoRollConstants';

describe('Piano roll velocity visuals', () => {
  it('normalizes both 0..1 and 1..127 velocity inputs onto the same MIDI scale', () => {
    expect(normalizeMidiVelocity(0)).toBe(1);
    expect(normalizeMidiVelocity(0.25)).toBe(32);
    expect(normalizeMidiVelocity(0.5)).toBe(64);
    expect(normalizeMidiVelocity(1)).toBe(127);
    expect(normalizeMidiVelocity(64)).toBe(64);
    expect(normalizeMidiVelocity(200)).toBe(127);
  });

  it('renders equivalent normalized and MIDI velocity inputs with the same note/bar colors', () => {
    expect(velocityToColor(0.25)).toBe(velocityToColor(32));
    expect(velocityToColor(0.5)).toBe(velocityToColor(64));
    expect(velocityToColor(0.9)).toBe(velocityToColor(114));

    expect(velocityToBarColor(0.25)).toBe(velocityToBarColor(32));
    expect(velocityToBarColor(0.5)).toBe(velocityToBarColor(64));
    expect(velocityToBarColor(0.9)).toBe(velocityToBarColor(114));
  });
});
