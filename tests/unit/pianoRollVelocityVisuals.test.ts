import { beforeEach, describe, expect, it } from 'vitest';
import {
  getVelocityLaneBarVisuals,
  getVelocityLaneBarVisualStyle,
  getPianoRollNoteVisuals,
  getPianoRollNoteVisualStyle,
  normalizeMidiVelocity,
  VELOCITY_LANE_HEIGHT,
  velocityToBarColor,
  velocityToColor,
} from '../../src/components/pianoroll/PianoRollConstants';
import { useProjectStore } from '../../src/store/projectStore';

function parseRgbChannels(color: string) {
  const match = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+)\s*)?\)$/);
  expect(match).not.toBeNull();

  return {
    red: Number(match![1]),
    green: Number(match![2]),
    blue: Number(match![3]),
    alpha: match![4] === undefined ? 1 : Number(match![4]),
  };
}

function expectAlpha(color: string, expectedAlpha: number) {
  expect(parseRgbChannels(color).alpha).toBeCloseTo(expectedAlpha);
}

describe('Piano roll velocity visuals', () => {
  beforeEach(() => {
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useProjectStore.persist.clearStorage();
    localStorage.clear();
    useProjectStore.getState().createProject({ name: 'Piano Roll Velocity Visuals' });
  });

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

    expect(parseRgbChannels(velocityToBarColor(0.25))).toEqual(parseRgbChannels(velocityToBarColor(32)));
    expect(parseRgbChannels(velocityToBarColor(0.5))).toEqual(parseRgbChannels(velocityToBarColor(64)));
    expect(parseRgbChannels(velocityToBarColor(0.9))).toEqual(parseRgbChannels(velocityToBarColor(114)));

    const lowBar = parseRgbChannels(velocityToBarColor(24));
    const highBar = parseRgbChannels(velocityToBarColor(118));
    expectAlpha(velocityToBarColor(24), 0.8);
    expectAlpha(velocityToBarColor(118), 0.8);
    expect(highBar.red).toBeGreaterThan(lowBar.red);
    expect(highBar.blue).toBeLessThan(lowBar.blue);
  });

  it('keeps the exported velocity lane height aligned with the piano roll layout contract', () => {
    expect(VELOCITY_LANE_HEIGHT).toBeGreaterThan(0);
    expect(Number.isInteger(VELOCITY_LANE_HEIGHT)).toBe(true);
  });

  it('derives distinct note colors for low and high velocities while preserving readable selection styling', () => {
    const lowVelocityNote = getPianoRollNoteVisualStyle(20, { isSelected: false, isSlide: false });
    const highVelocityNote = getPianoRollNoteVisualStyle(120, { isSelected: true, isSlide: false });

    expect(lowVelocityNote.fillStyle).not.toBe(highVelocityNote.fillStyle);
    expect(lowVelocityNote.globalAlpha).toBe(0.8);
    expect(highVelocityNote.globalAlpha).toBe(1);
    expect(highVelocityNote.strokeStyle).toBe('#fff');
    expect(highVelocityNote.strokeWidth).toBe(1.5);
    expect(highVelocityNote.velocityAccentOpacity).toBeGreaterThan(lowVelocityNote.velocityAccentOpacity);
  });

  it('keeps the public piano-roll visual helpers aligned with the underlying style functions', () => {
    expect(getPianoRollNoteVisuals(96, { isSelected: true })).toEqual(
      getPianoRollNoteVisualStyle(96, { isSelected: true }),
    );
    expect(getVelocityLaneBarVisuals(48, { isMuted: true })).toEqual(
      getVelocityLaneBarVisualStyle(48, { isMuted: true }),
    );
  });

  it('keeps slide notes and velocity-lane bars visually distinct from normal notes', () => {
    const slideNote = getPianoRollNoteVisualStyle(32, { isSelected: false, isSlide: true });
    const regularBar = getVelocityLaneBarVisualStyle(32, { isSelected: false, isSlide: false });
    const selectedSlideBar = getVelocityLaneBarVisualStyle(96, { isSelected: true, isSlide: true });
    const regularBarColor = parseRgbChannels(regularBar.fillStyle);
    const expectedRegularBarColor = parseRgbChannels(velocityToBarColor(32));

    const slideFill = parseRgbChannels(slideNote.fillStyle);
    expect(slideFill).toEqual({ red: 251, green: 191, blue: 36, alpha: 0.92 });
    const slideStroke = parseRgbChannels(slideNote.strokeStyle);
    expect(slideStroke).toEqual({ red: 251, green: 191, blue: 36, alpha: 0.9 });
    expect(regularBarColor).toEqual(expectedRegularBarColor);
    expect(regularBar.globalAlpha).toBe(0.6);
    expectAlpha(selectedSlideBar.fillStyle, 0.85);
    expect(selectedSlideBar.globalAlpha).toBe(1);
    expect(selectedSlideBar.highlightAlpha).toBeGreaterThan(regularBar.highlightAlpha);
  });

  it('keeps selected and muted note states distinguishable without breaking velocity mapping', () => {
    const baseNote = getPianoRollNoteVisuals(96);
    const selectedNote = getPianoRollNoteVisuals(96, { isSelected: true });
    const mutedNote = getPianoRollNoteVisuals(96, { isMuted: true });
    const baseBar = getVelocityLaneBarVisuals(96);
    const mutedBar = getVelocityLaneBarVisuals(96, { isMuted: true });

    expect(selectedNote.fillStyle).toBe(baseNote.fillStyle);
    expect(selectedNote.strokeStyle).toBe('#fff');
    expect(selectedNote.globalAlpha).toBeGreaterThan(baseNote.globalAlpha);
    expect(mutedNote.fillStyle).toBe(baseNote.fillStyle);
    expect(mutedNote.globalAlpha).toBeLessThan(baseNote.globalAlpha);
    expect(baseBar.fillStyle).toBe(velocityToBarColor(96));
    expect(mutedBar.fillStyle).toBe(baseBar.fillStyle);
    expect(mutedBar.globalAlpha).toBeLessThan(baseBar.globalAlpha);
  });
});
