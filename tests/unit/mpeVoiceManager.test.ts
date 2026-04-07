import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MpeVoiceManager, type MpeExpressionCallback } from '../../src/engine/dsp/core/mpe-voice-manager';
import type { VoiceCallbacks } from '../../src/engine/dsp/core/voice-manager';
import type { MpeConfig, MpeNoteExpression } from '../../src/engine/dsp/core/mpe';

interface MockVoice {
  id: number;
  note: number;
}

function createVoices(count: number): MockVoice[] {
  return Array.from({ length: count }, (_, i) => ({ id: i, note: -1 }));
}

describe('MpeVoiceManager', () => {
  let voices: MockVoice[];
  let callbacks: VoiceCallbacks<MockVoice>;
  let expressionCb: MpeExpressionCallback<MockVoice>;
  let onExpression: ReturnType<typeof vi.fn>;

  const lowerZoneConfig: MpeConfig = {
    enabled: true,
    lowerZone: { masterChannel: 0, memberChannelCount: 15 },
    upperZone: null,
  };

  beforeEach(() => {
    voices = createVoices(8);
    callbacks = {
      onAttack: vi.fn((voice, note) => { voice.note = note; }),
      onRelease: vi.fn((voice) => { voice.note = -1; }),
    };
    onExpression = vi.fn();
    expressionCb = { onExpression };
  });

  // -----------------------------------------------------------------------
  // Basic voice allocation (delegation to VoiceManager)
  // -----------------------------------------------------------------------

  it('allocates voices via noteOn', () => {
    const mvm = new MpeVoiceManager(voices, callbacks, lowerZoneConfig, expressionCb);
    const v = mvm.noteOn(60, 0.8, 1);
    expect(v).toBeDefined();
    expect(mvm.activeCount).toBe(1);
    expect(callbacks.onAttack).toHaveBeenCalledWith(v, 60, 0.8);
  });

  it('releases voices via noteOff', () => {
    const mvm = new MpeVoiceManager(voices, callbacks, lowerZoneConfig, expressionCb);
    mvm.noteOn(60, 0.8, 1);
    mvm.noteOff(60, 1);
    expect(callbacks.onRelease).toHaveBeenCalled();
  });

  it('reports maxPolyphony and activeCount', () => {
    const mvm = new MpeVoiceManager(voices, callbacks);
    expect(mvm.maxPolyphony).toBe(8);
    expect(mvm.activeCount).toBe(0);
    mvm.noteOn(60, 0.8);
    expect(mvm.activeCount).toBe(1);
  });

  // -----------------------------------------------------------------------
  // Per-note pitch bend (MPE mode)
  // -----------------------------------------------------------------------

  describe('per-note pitch bend', () => {
    it('applies per-note pitch bend via member channel', () => {
      const mvm = new MpeVoiceManager(voices, callbacks, lowerZoneConfig, expressionCb);
      const v = mvm.noteOn(60, 0.8, 1);

      // Send pitch bend on channel 1 (member channel)
      // 8192 = center (0), 16383 ≈ +48 semitones
      mvm.pitchBend(1, 12288); // 8192 + 4096 = half up = +24 semitones

      const expr = mvm.getVoiceExpression(v);
      expect(expr.pitchBend).toBe(24);
    });

    it('applies independent pitch bend per note', () => {
      const mvm = new MpeVoiceManager(voices, callbacks, lowerZoneConfig, expressionCb);
      const v1 = mvm.noteOn(60, 0.8, 1);
      const v2 = mvm.noteOn(64, 0.8, 2);

      mvm.pitchBend(1, 12288); // +24 semitones on voice 1
      mvm.pitchBend(2, 4096);  // -24 semitones on voice 2

      expect(mvm.getVoiceExpression(v1).pitchBend).toBe(24);
      expect(mvm.getVoiceExpression(v2).pitchBend).toBe(-24);
    });

    it('master channel pitch bend adds to all voices', () => {
      const mvm = new MpeVoiceManager(voices, callbacks, lowerZoneConfig, expressionCb);
      const v1 = mvm.noteOn(60, 0.8, 1);
      const v2 = mvm.noteOn(64, 0.8, 2);

      // Per-note bend on voice 1: +24 semitones
      mvm.pitchBend(1, 12288);

      // Master bend (channel 0): +1 semitone (range=2, half up)
      mvm.pitchBend(0, 12288); // +1 semitone with master range 2

      // v1: 24 (per-note) + 1 (master) = 25
      expect(mvm.getVoiceExpression(v1).pitchBend).toBe(25);
      // v2: 0 (per-note) + 1 (master) = 1
      expect(mvm.getVoiceExpression(v2).pitchBend).toBe(1);
    });

    it('triggers expression callback on pitch bend', () => {
      const mvm = new MpeVoiceManager(voices, callbacks, lowerZoneConfig, expressionCb);
      mvm.noteOn(60, 0.8, 1);
      mvm.pitchBend(1, 12288);

      expect(onExpression).toHaveBeenCalledTimes(1);
      expect(onExpression.mock.calls[0][1].pitchBend).toBe(24);
    });
  });

  // -----------------------------------------------------------------------
  // Per-note slide (CC74)
  // -----------------------------------------------------------------------

  describe('per-note slide (CC74)', () => {
    it('applies per-note slide via member channel', () => {
      const mvm = new MpeVoiceManager(voices, callbacks, lowerZoneConfig, expressionCb);
      const v = mvm.noteOn(60, 0.8, 3);

      mvm.slide(3, 100); // 100/127 ≈ 0.787

      const expr = mvm.getVoiceExpression(v);
      expect(expr.slide).toBeCloseTo(100 / 127, 3);
    });

    it('applies independent slide per note', () => {
      const mvm = new MpeVoiceManager(voices, callbacks, lowerZoneConfig, expressionCb);
      const v1 = mvm.noteOn(60, 0.8, 1);
      const v2 = mvm.noteOn(64, 0.8, 2);

      mvm.slide(1, 127);
      mvm.slide(2, 0);

      expect(mvm.getVoiceExpression(v1).slide).toBeCloseTo(1, 3);
      expect(mvm.getVoiceExpression(v2).slide).toBe(0);
    });

    it('master channel slide adds to all voices (clamped to 1)', () => {
      const mvm = new MpeVoiceManager(voices, callbacks, lowerZoneConfig, expressionCb);
      const v1 = mvm.noteOn(60, 0.8, 1);

      mvm.slide(1, 100); // per-note: 100/127
      mvm.slide(0, 64);  // master: 64/127

      const expr = mvm.getVoiceExpression(v1);
      // Sum would exceed 1, so should be clamped
      expect(expr.slide).toBeLessThanOrEqual(1);
    });
  });

  // -----------------------------------------------------------------------
  // Per-note pressure (channel aftertouch)
  // -----------------------------------------------------------------------

  describe('per-note pressure (channel aftertouch)', () => {
    it('applies per-note pressure via member channel', () => {
      const mvm = new MpeVoiceManager(voices, callbacks, lowerZoneConfig, expressionCb);
      const v = mvm.noteOn(60, 0.8, 4);

      mvm.pressure(4, 80);

      expect(mvm.getVoiceExpression(v).pressure).toBeCloseTo(80 / 127, 3);
    });

    it('applies independent pressure per note', () => {
      const mvm = new MpeVoiceManager(voices, callbacks, lowerZoneConfig, expressionCb);
      const v1 = mvm.noteOn(60, 0.8, 1);
      const v2 = mvm.noteOn(64, 0.8, 2);

      mvm.pressure(1, 127);
      mvm.pressure(2, 32);

      expect(mvm.getVoiceExpression(v1).pressure).toBeCloseTo(1, 3);
      expect(mvm.getVoiceExpression(v2).pressure).toBeCloseTo(32 / 127, 3);
    });

    it('master channel pressure adds to all voices (clamped to 1)', () => {
      const mvm = new MpeVoiceManager(voices, callbacks, lowerZoneConfig, expressionCb);
      const v1 = mvm.noteOn(60, 0.8, 1);

      mvm.pressure(1, 100);
      mvm.pressure(0, 100);

      expect(mvm.getVoiceExpression(v1).pressure).toBeLessThanOrEqual(1);
    });
  });

  // -----------------------------------------------------------------------
  // Non-MPE mode fallback
  // -----------------------------------------------------------------------

  describe('non-MPE mode', () => {
    it('applies pitch bend globally in non-MPE mode', () => {
      const mvm = new MpeVoiceManager(voices, callbacks, undefined, expressionCb);
      const v1 = mvm.noteOn(60, 0.8, 0);
      const v2 = mvm.noteOn(64, 0.8, 0);

      mvm.pitchBend(0, 12288); // +1 semitone (master range)

      expect(mvm.getVoiceExpression(v1).pitchBend).toBe(1);
      expect(mvm.getVoiceExpression(v2).pitchBend).toBe(1);
    });

    it('applies slide globally in non-MPE mode', () => {
      const mvm = new MpeVoiceManager(voices, callbacks, undefined, expressionCb);
      const v1 = mvm.noteOn(60, 0.8);
      const v2 = mvm.noteOn(64, 0.8);

      mvm.slide(0, 100);

      expect(mvm.getVoiceExpression(v1).slide).toBeCloseTo(100 / 127, 3);
      expect(mvm.getVoiceExpression(v2).slide).toBeCloseTo(100 / 127, 3);
    });
  });

  // -----------------------------------------------------------------------
  // Expression state lifecycle
  // -----------------------------------------------------------------------

  describe('expression lifecycle', () => {
    it('new voice on same channel starts with clean expression', () => {
      const mvm = new MpeVoiceManager(voices, callbacks, lowerZoneConfig, expressionCb);
      mvm.noteOn(60, 0.8, 1);
      mvm.pitchBend(1, 16383); // max bend

      // New note on same channel gets a fresh voice with clean expression
      const v2 = mvm.noteOn(72, 0.8, 1);
      expect(mvm.getPerNoteExpression(v2).pitchBend).toBe(0);
    });

    it('resets expression on voiceEnded', () => {
      const mvm = new MpeVoiceManager(voices, callbacks, lowerZoneConfig, expressionCb);
      const v = mvm.noteOn(60, 0.8, 1);
      mvm.slide(1, 100);

      mvm.voiceEnded(v);

      expect(mvm.getPerNoteExpression(v).slide).toBe(0);
    });

    it('stopAll resets all expression state', () => {
      const mvm = new MpeVoiceManager(voices, callbacks, lowerZoneConfig, expressionCb);
      mvm.noteOn(60, 0.8, 1);
      mvm.noteOn(64, 0.8, 2);
      mvm.pitchBend(1, 16383);
      mvm.slide(2, 127);

      mvm.stopAll();

      expect(mvm.activeCount).toBe(0);
      expect(mvm.masterExpression.pitchBend).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // MPE zone configuration
  // -----------------------------------------------------------------------

  describe('MPE zone configuration', () => {
    it('allows updating MPE config at runtime', () => {
      const mvm = new MpeVoiceManager(voices, callbacks);
      expect(mvm.mpeConfig.enabled).toBe(false);

      mvm.mpeConfig = lowerZoneConfig;
      expect(mvm.mpeConfig.enabled).toBe(true);
    });

    it('works with upper zone', () => {
      const upperConfig: MpeConfig = {
        enabled: true,
        lowerZone: null,
        upperZone: { masterChannel: 15, memberChannelCount: 7 },
      };
      const mvm = new MpeVoiceManager(voices, callbacks, upperConfig, expressionCb);

      const v = mvm.noteOn(60, 0.8, 14); // channel 14 = member of upper zone
      mvm.pitchBend(14, 12288);

      expect(mvm.getVoiceExpression(v).pitchBend).toBe(24);

      // Master pitch bend on channel 15
      mvm.pitchBend(15, 12288); // +1 semitone
      expect(mvm.getVoiceExpression(v).pitchBend).toBe(25);
    });

    it('handles dual-zone configuration', () => {
      const dualConfig: MpeConfig = {
        enabled: true,
        lowerZone: { masterChannel: 0, memberChannelCount: 7 },
        upperZone: { masterChannel: 15, memberChannelCount: 7 },
      };
      const mvm = new MpeVoiceManager(voices, callbacks, dualConfig, expressionCb);

      const v1 = mvm.noteOn(60, 0.8, 1);  // lower zone
      const v2 = mvm.noteOn(72, 0.8, 14); // upper zone

      mvm.pitchBend(1, 12288);  // +24 for lower voice
      mvm.pitchBend(14, 4096);  // -24 for upper voice

      expect(mvm.getVoiceExpression(v1).pitchBend).toBe(24);
      expect(mvm.getVoiceExpression(v2).pitchBend).toBe(-24);
    });
  });
});
