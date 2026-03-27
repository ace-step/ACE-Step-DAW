import { describe, it, expect } from 'vitest';
import {
  FACTORY_IR_PRESETS,
  generateImpulseResponse,
  type FactoryIRType,
} from '../factoryImpulseResponses';

describe('factoryImpulseResponses', () => {
  it('exports all expected factory IR presets', () => {
    const expectedTypes: FactoryIRType[] = ['smallRoom', 'largeHall', 'plate', 'spring'];
    for (const type of expectedTypes) {
      expect(FACTORY_IR_PRESETS).toHaveProperty(type);
      expect(FACTORY_IR_PRESETS[type]).toHaveProperty('label');
      expect(FACTORY_IR_PRESETS[type]).toHaveProperty('duration');
      expect(FACTORY_IR_PRESETS[type]).toHaveProperty('decay');
    }
  });

  it('generates a Float32Array of correct length for each preset', () => {
    const sampleRate = 44100;
    for (const type of Object.keys(FACTORY_IR_PRESETS) as FactoryIRType[]) {
      const preset = FACTORY_IR_PRESETS[type];
      const buffer = generateImpulseResponse(preset, sampleRate);
      const expectedLength = Math.floor(preset.duration * sampleRate);
      expect(buffer).toBeInstanceOf(Float32Array);
      expect(buffer.length).toBe(expectedLength);
    }
  });

  it('generates decaying samples (start amplitude > end amplitude on average)', () => {
    const sampleRate = 44100;
    const preset = FACTORY_IR_PRESETS.largeHall;
    const buffer = generateImpulseResponse(preset, sampleRate);

    // Compare average of first 10% vs last 10%
    const tenPercent = Math.floor(buffer.length * 0.1);
    let startSum = 0;
    let endSum = 0;
    for (let i = 0; i < tenPercent; i++) {
      startSum += Math.abs(buffer[i]);
      endSum += Math.abs(buffer[buffer.length - 1 - i]);
    }
    expect(startSum / tenPercent).toBeGreaterThan(endSum / tenPercent);
  });

  it('generates different buffers for different presets', () => {
    const sampleRate = 44100;
    const room = generateImpulseResponse(FACTORY_IR_PRESETS.smallRoom, sampleRate);
    const hall = generateImpulseResponse(FACTORY_IR_PRESETS.largeHall, sampleRate);
    expect(room.length).not.toBe(hall.length);
  });
});
