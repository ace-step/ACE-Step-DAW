import { describe, it, expect } from 'vitest';
import {
  isBlackKey,
  midiNoteToName,
  gridSizeToBeats,
  normalizeMidiVelocity,
  velocityToColor,
  velocityToBarColor,
  getPianoRollNoteVisualStyle,
  getVelocityLaneBarVisualStyle,
  getPianoRollToolShortcut,
  generateNoteId,
  MIDI_MAX_NOTE,
  PIANO_ROLL_KEY_HEIGHT,
  PIANO_KEYBOARD_WIDTH,
  VELOCITY_LANE_HEIGHT,
} from '../PianoRollConstants';

describe('PianoRollConstants', () => {
  describe('MIDI constants', () => {
    it('MIDI_MAX_NOTE is 127', () => {
      expect(MIDI_MAX_NOTE).toBe(127);
    });

    it('PIANO_ROLL_KEY_HEIGHT is positive', () => {
      expect(PIANO_ROLL_KEY_HEIGHT).toBeGreaterThan(0);
    });

    it('PIANO_KEYBOARD_WIDTH is positive', () => {
      expect(PIANO_KEYBOARD_WIDTH).toBeGreaterThan(0);
    });

    it('VELOCITY_LANE_HEIGHT is positive', () => {
      expect(VELOCITY_LANE_HEIGHT).toBeGreaterThan(0);
    });
  });

  describe('isBlackKey', () => {
    it('C is white', () => expect(isBlackKey(0)).toBe(false));
    it('C# is black', () => expect(isBlackKey(1)).toBe(true));
    it('D is white', () => expect(isBlackKey(2)).toBe(false));
    it('D# is black', () => expect(isBlackKey(3)).toBe(true));
    it('E is white', () => expect(isBlackKey(4)).toBe(false));
    it('F is white', () => expect(isBlackKey(5)).toBe(false));
    it('F# is black', () => expect(isBlackKey(6)).toBe(true));
    it('G is white', () => expect(isBlackKey(7)).toBe(false));
    it('G# is black', () => expect(isBlackKey(8)).toBe(true));
    it('A is white', () => expect(isBlackKey(9)).toBe(false));
    it('A# is black', () => expect(isBlackKey(10)).toBe(true));
    it('B is white', () => expect(isBlackKey(11)).toBe(false));
    it('wraps correctly for higher octaves (C5=60)', () => expect(isBlackKey(60)).toBe(false));
    it('wraps correctly for C#5=61', () => expect(isBlackKey(61)).toBe(true));
  });

  describe('midiNoteToName', () => {
    it('MIDI 60 is C4', () => expect(midiNoteToName(60)).toBe('C4'));
    it('MIDI 69 is A4', () => expect(midiNoteToName(69)).toBe('A4'));
    it('MIDI 0 is C-1', () => expect(midiNoteToName(0)).toBe('C-1'));
    it('MIDI 127 is G9', () => expect(midiNoteToName(127)).toBe('G9'));
    it('MIDI 48 is C3', () => expect(midiNoteToName(48)).toBe('C3'));
    it('MIDI 61 is C#4', () => expect(midiNoteToName(61)).toBe('C#4'));
  });

  describe('gridSizeToBeats', () => {
    it('1/4 = 1 beat', () => expect(gridSizeToBeats('1/4')).toBe(1));
    it('1/8 = 0.5 beats', () => expect(gridSizeToBeats('1/8')).toBe(0.5));
    it('1/16 = 0.25 beats', () => expect(gridSizeToBeats('1/16')).toBe(0.25));
    it('1/32 = 0.125 beats', () => expect(gridSizeToBeats('1/32')).toBe(0.125));
  });

  describe('normalizeMidiVelocity', () => {
    it('clamps 0-1 range to 0-127', () => {
      expect(normalizeMidiVelocity(0.5)).toBe(64);
    });

    it('passes through 1-127 range', () => {
      expect(normalizeMidiVelocity(100)).toBe(100);
    });

    it('clamps minimum to 1', () => {
      expect(normalizeMidiVelocity(0)).toBe(1);
    });

    it('clamps maximum to 127', () => {
      expect(normalizeMidiVelocity(200)).toBe(127);
    });

    it('handles NaN/Infinity gracefully', () => {
      expect(normalizeMidiVelocity(NaN)).toBe(1);
      expect(normalizeMidiVelocity(Infinity)).toBe(1);
    });

    it('normalizes 1.0 to 127', () => {
      expect(normalizeMidiVelocity(1.0)).toBe(127);
    });
  });

  describe('velocityToColor', () => {
    it('returns rgb string', () => {
      expect(velocityToColor(100)).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
    });

    it('different velocities produce different colors', () => {
      expect(velocityToColor(20)).not.toBe(velocityToColor(120));
    });
  });

  describe('velocityToBarColor', () => {
    it('returns rgba string', () => {
      expect(velocityToBarColor(100)).toMatch(/^rgba\(\d+,\d+,\d+,[\d.]+\)$/);
    });
  });

  describe('getPianoRollNoteVisualStyle', () => {
    it('returns style for normal note', () => {
      const style = getPianoRollNoteVisualStyle(100, { isSelected: false, isSlide: false });
      expect(style.fillStyle).toMatch(/^rgb/);
      expect(style.strokeWidth).toBe(0.5);
      expect(style.globalAlpha).toBe(0.8);
    });

    it('returns style for selected note', () => {
      const style = getPianoRollNoteVisualStyle(100, { isSelected: true, isSlide: false });
      expect(style.strokeStyle).toBe('#fff');
      expect(style.strokeWidth).toBe(1.5);
      expect(style.globalAlpha).toBe(1);
    });

    it('returns slide note style', () => {
      const style = getPianoRollNoteVisualStyle(100, { isSelected: false, isSlide: true });
      expect(style.fillStyle).toContain('251, 191, 36'); // amber color
      expect(style.velocityAccentOpacity).toBe(0);
    });

    it('selected slide note has lighter stroke', () => {
      const style = getPianoRollNoteVisualStyle(100, { isSelected: true, isSlide: true });
      expect(style.strokeStyle).toBe('#fff7d6');
    });
  });

  describe('getVelocityLaneBarVisualStyle', () => {
    it('normal bar has lower alpha', () => {
      const style = getVelocityLaneBarVisualStyle(100, { isSelected: false, isSlide: false });
      expect(style.globalAlpha).toBe(0.6);
    });

    it('selected bar has full alpha', () => {
      const style = getVelocityLaneBarVisualStyle(100, { isSelected: true, isSlide: false });
      expect(style.globalAlpha).toBe(1);
    });

    it('slide bar uses amber color', () => {
      const style = getVelocityLaneBarVisualStyle(100, { isSelected: false, isSlide: true });
      expect(style.fillStyle).toContain('251,191,36');
    });
  });

  describe('getPianoRollToolShortcut', () => {
    it('select = 1', () => expect(getPianoRollToolShortcut('select')).toBe('1'));
    it('pencil = 2', () => expect(getPianoRollToolShortcut('pencil')).toBe('2'));
    it('paint = 3', () => expect(getPianoRollToolShortcut('paint')).toBe('3'));
    it('erase = 4', () => expect(getPianoRollToolShortcut('erase')).toBe('4'));
    it('slide = 5', () => expect(getPianoRollToolShortcut('slide')).toBe('5'));
    it('velocityPaint = 6', () => expect(getPianoRollToolShortcut('velocityPaint')).toBe('6'));
  });

  describe('generateNoteId', () => {
    it('returns unique ids', () => {
      const id1 = generateNoteId();
      const id2 = generateNoteId();
      expect(id1).not.toBe(id2);
    });

    it('starts with note- prefix', () => {
      expect(generateNoteId()).toMatch(/^note-/);
    });
  });
});
