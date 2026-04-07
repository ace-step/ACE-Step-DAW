import { describe, expect, it } from 'vitest';
import {
  parseMidiMessage,
  pitchBendToSemitones,
  createDefaultMpeConfig,
  createDefaultExpression,
  getMpeZoneForChannel,
  isMasterChannel,
  MpeConfigDetector,
  MPE_CC_SLIDE,
  MPE_DEFAULT_BEND_RANGE,
  MPE_MASTER_BEND_RANGE,
  type MpeConfig,
  type MpeNoteExpression,
} from '../../src/engine/dsp/core/mpe';

// ---------------------------------------------------------------------------
// parseMidiMessage
// ---------------------------------------------------------------------------

describe('parseMidiMessage', () => {
  it('parses Note On (velocity > 0)', () => {
    // Note On, channel 2, note 60, velocity 100
    const msg = parseMidiMessage(new Uint8Array([0x92, 60, 100]));
    expect(msg).toEqual({ type: 'noteOn', channel: 2, data1: 60, data2: 100 });
  });

  it('parses Note On with velocity 0 as Note Off', () => {
    const msg = parseMidiMessage(new Uint8Array([0x90, 64, 0]));
    expect(msg).toEqual({ type: 'noteOff', channel: 0, data1: 64, data2: 0 });
  });

  it('parses Note Off', () => {
    const msg = parseMidiMessage(new Uint8Array([0x83, 72, 64]));
    expect(msg).toEqual({ type: 'noteOff', channel: 3, data1: 72, data2: 64 });
  });

  it('parses CC messages', () => {
    // CC74 (slide) on channel 5, value 127
    const msg = parseMidiMessage(new Uint8Array([0xb5, 74, 127]));
    expect(msg).toEqual({ type: 'cc', channel: 5, data1: 74, data2: 127 });
  });

  it('parses Pitch Bend with 14-bit value', () => {
    // Pitch Bend on channel 1: LSB=0, MSB=64 → center (8192)
    const msg = parseMidiMessage(new Uint8Array([0xe1, 0, 64]));
    expect(msg).toEqual({ type: 'pitchBend', channel: 1, data1: 0, data2: 8192 });
  });

  it('parses Pitch Bend minimum (0)', () => {
    const msg = parseMidiMessage(new Uint8Array([0xe0, 0, 0]));
    expect(msg).toEqual({ type: 'pitchBend', channel: 0, data1: 0, data2: 0 });
  });

  it('parses Pitch Bend maximum (16383)', () => {
    const msg = parseMidiMessage(new Uint8Array([0xe0, 127, 127]));
    expect(msg).toEqual({ type: 'pitchBend', channel: 0, data1: 0, data2: 16383 });
  });

  it('parses Channel Pressure (aftertouch)', () => {
    const msg = parseMidiMessage(new Uint8Array([0xd4, 100]));
    expect(msg).toEqual({ type: 'channelPressure', channel: 4, data1: 100, data2: 0 });
  });

  it('returns null for empty data', () => {
    expect(parseMidiMessage(new Uint8Array([]))).toBeNull();
    expect(parseMidiMessage(new Uint8Array())).toBeNull();
  });

  it('returns null for too-short Note On', () => {
    expect(parseMidiMessage(new Uint8Array([0x90, 60]))).toBeNull();
  });

  it('handles unknown status bytes as "other"', () => {
    const msg = parseMidiMessage(new Uint8Array([0xf0, 0x7e, 0x7f]));
    expect(msg?.type).toBe('other');
  });
});

// ---------------------------------------------------------------------------
// pitchBendToSemitones
// ---------------------------------------------------------------------------

describe('pitchBendToSemitones', () => {
  it('center (8192) returns 0 semitones', () => {
    expect(pitchBendToSemitones(8192, 48)).toBe(0);
  });

  it('maximum bend returns +bendRange semitones', () => {
    expect(pitchBendToSemitones(16383, 48)).toBeCloseTo(48, 1);
  });

  it('minimum bend returns -bendRange semitones', () => {
    expect(pitchBendToSemitones(0, 48)).toBe(-48);
  });

  it('works with master bend range (2 semitones)', () => {
    expect(pitchBendToSemitones(16383, 2)).toBeCloseTo(2, 1);
    expect(pitchBendToSemitones(0, 2)).toBe(-2);
  });

  it('half-up returns approximately half the range', () => {
    // 8192 + 4096 = 12288
    expect(pitchBendToSemitones(12288, 48)).toBe(24);
  });
});

// ---------------------------------------------------------------------------
// MPE Config Helpers
// ---------------------------------------------------------------------------

describe('createDefaultMpeConfig', () => {
  it('returns disabled config with no zones', () => {
    const config = createDefaultMpeConfig();
    expect(config.enabled).toBe(false);
    expect(config.lowerZone).toBeNull();
    expect(config.upperZone).toBeNull();
  });
});

describe('createDefaultExpression', () => {
  it('returns zeroed expression state', () => {
    const expr = createDefaultExpression();
    expect(expr.pitchBend).toBe(0);
    expect(expr.slide).toBe(0);
    expect(expr.pressure).toBe(0);
  });
});

describe('getMpeZoneForChannel', () => {
  const config: MpeConfig = {
    enabled: true,
    lowerZone: { masterChannel: 0, memberChannelCount: 8 },
    upperZone: null,
  };

  it('returns "lower" for member channels 1-8', () => {
    for (let ch = 1; ch <= 8; ch++) {
      expect(getMpeZoneForChannel(config, ch)).toBe('lower');
    }
  });

  it('returns null for master channel 0', () => {
    expect(getMpeZoneForChannel(config, 0)).toBeNull();
  });

  it('returns null for channels outside the zone', () => {
    expect(getMpeZoneForChannel(config, 9)).toBeNull();
    expect(getMpeZoneForChannel(config, 15)).toBeNull();
  });

  it('returns null when MPE is disabled', () => {
    const disabledConfig = createDefaultMpeConfig();
    expect(getMpeZoneForChannel(disabledConfig, 1)).toBeNull();
  });

  it('handles upper zone correctly', () => {
    const upperConfig: MpeConfig = {
      enabled: true,
      lowerZone: null,
      upperZone: { masterChannel: 15, memberChannelCount: 5 },
    };
    // Upper zone members: 15-5=10..14
    expect(getMpeZoneForChannel(upperConfig, 10)).toBe('upper');
    expect(getMpeZoneForChannel(upperConfig, 14)).toBe('upper');
    expect(getMpeZoneForChannel(upperConfig, 9)).toBeNull();
    expect(getMpeZoneForChannel(upperConfig, 15)).toBeNull();
  });

  it('handles dual-zone config', () => {
    const dualConfig: MpeConfig = {
      enabled: true,
      lowerZone: { masterChannel: 0, memberChannelCount: 7 },
      upperZone: { masterChannel: 15, memberChannelCount: 7 },
    };
    // Lower: 1-7, Upper: 8-14
    expect(getMpeZoneForChannel(dualConfig, 1)).toBe('lower');
    expect(getMpeZoneForChannel(dualConfig, 7)).toBe('lower');
    expect(getMpeZoneForChannel(dualConfig, 8)).toBe('upper');
    expect(getMpeZoneForChannel(dualConfig, 14)).toBe('upper');
    expect(getMpeZoneForChannel(dualConfig, 0)).toBeNull();
    expect(getMpeZoneForChannel(dualConfig, 15)).toBeNull();
  });
});

describe('isMasterChannel', () => {
  it('identifies lower zone master (channel 0)', () => {
    const config: MpeConfig = {
      enabled: true,
      lowerZone: { masterChannel: 0, memberChannelCount: 15 },
      upperZone: null,
    };
    expect(isMasterChannel(config, 0)).toBe(true);
    expect(isMasterChannel(config, 1)).toBe(false);
  });

  it('identifies upper zone master (channel 15)', () => {
    const config: MpeConfig = {
      enabled: true,
      lowerZone: null,
      upperZone: { masterChannel: 15, memberChannelCount: 7 },
    };
    expect(isMasterChannel(config, 15)).toBe(true);
    expect(isMasterChannel(config, 14)).toBe(false);
  });

  it('returns false when MPE is disabled', () => {
    const config = createDefaultMpeConfig();
    expect(isMasterChannel(config, 0)).toBe(false);
    expect(isMasterChannel(config, 15)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MpeConfigDetector (MCM detection)
// ---------------------------------------------------------------------------

describe('MpeConfigDetector', () => {
  it('detects lower zone MCM (RPN 0x0006 on channel 0)', () => {
    const detector = new MpeConfigDetector();

    // Step 1: CC 101 = 0 (RPN MSB)
    expect(detector.processCC(0, 101, 0)).toBe(false);
    // Step 2: CC 100 = 6 (RPN LSB)
    expect(detector.processCC(0, 100, 6)).toBe(false);
    // Step 3: CC 6 = 15 (Data Entry: 15 member channels)
    expect(detector.processCC(0, 6, 15)).toBe(true);

    const config = detector.config;
    expect(config.enabled).toBe(true);
    expect(config.lowerZone).toEqual({ masterChannel: 0, memberChannelCount: 15 });
    expect(config.upperZone).toBeNull();
  });

  it('detects upper zone MCM (RPN 0x0006 on channel 15)', () => {
    const detector = new MpeConfigDetector();

    detector.processCC(15, 101, 0);
    detector.processCC(15, 100, 6);
    expect(detector.processCC(15, 6, 8)).toBe(true);

    const config = detector.config;
    expect(config.enabled).toBe(true);
    expect(config.lowerZone).toBeNull();
    expect(config.upperZone).toEqual({ masterChannel: 15, memberChannelCount: 8 });
  });

  it('disables zone when member count is 0', () => {
    const detector = new MpeConfigDetector();

    // First enable lower zone
    detector.processCC(0, 101, 0);
    detector.processCC(0, 100, 6);
    detector.processCC(0, 6, 10);
    expect(detector.config.enabled).toBe(true);

    // Now disable it with count=0
    detector.processCC(0, 101, 0);
    detector.processCC(0, 100, 6);
    expect(detector.processCC(0, 6, 0)).toBe(true);
    expect(detector.config.enabled).toBe(false);
    expect(detector.config.lowerZone).toBeNull();
  });

  it('ignores MCM on non-master channels', () => {
    const detector = new MpeConfigDetector();

    // Send RPN 6 on channel 5 — should not configure anything
    detector.processCC(5, 101, 0);
    detector.processCC(5, 100, 6);
    expect(detector.processCC(5, 6, 10)).toBe(false);
    expect(detector.config.enabled).toBe(false);
  });

  it('ignores Data Entry when RPN is not 0x0006', () => {
    const detector = new MpeConfigDetector();

    // Set RPN to 0x0000 (pitch bend range), not 0x0006
    detector.processCC(0, 101, 0);
    detector.processCC(0, 100, 0);
    expect(detector.processCC(0, 6, 15)).toBe(false);
    expect(detector.config.enabled).toBe(false);
  });

  it('clamps member count to 0-15', () => {
    const detector = new MpeConfigDetector();

    detector.processCC(0, 101, 0);
    detector.processCC(0, 100, 6);
    detector.processCC(0, 6, 20); // > 15, should clamp

    expect(detector.config.lowerZone?.memberChannelCount).toBe(15);
  });

  it('supports dual-zone configuration', () => {
    const detector = new MpeConfigDetector();

    // Configure lower zone with 7 members
    detector.processCC(0, 101, 0);
    detector.processCC(0, 100, 6);
    detector.processCC(0, 6, 7);

    // Configure upper zone with 7 members
    detector.processCC(15, 101, 0);
    detector.processCC(15, 100, 6);
    detector.processCC(15, 6, 7);

    const config = detector.config;
    expect(config.enabled).toBe(true);
    expect(config.lowerZone).toEqual({ masterChannel: 0, memberChannelCount: 7 });
    expect(config.upperZone).toEqual({ masterChannel: 15, memberChannelCount: 7 });
  });

  it('allows pre-initialized config', () => {
    const initialConfig: MpeConfig = {
      enabled: true,
      lowerZone: { masterChannel: 0, memberChannelCount: 15 },
      upperZone: null,
    };
    const detector = new MpeConfigDetector(initialConfig);
    expect(detector.config.enabled).toBe(true);
    expect(detector.config.lowerZone?.memberChannelCount).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('MPE constants', () => {
  it('has correct CC slide number', () => {
    expect(MPE_CC_SLIDE).toBe(74);
  });

  it('has correct default bend ranges', () => {
    expect(MPE_DEFAULT_BEND_RANGE).toBe(48);
    expect(MPE_MASTER_BEND_RANGE).toBe(2);
  });
});
