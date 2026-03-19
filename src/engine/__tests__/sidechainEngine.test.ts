import { describe, it, expect } from 'vitest';
import { computeSidechainGain, createEnvelopeFollowerState, updateEnvelope } from '../../utils/sidechainEnvelope';

describe('sidechain engine integration', () => {
  describe('envelope + gain computation pipeline', () => {
    it('produces no gain reduction when source is silent', () => {
      let env = createEnvelopeFollowerState();
      for (let i = 0; i < 10; i++) {
        env = updateEnvelope(env, -100, 0.01, 0.2, 1 / 60);
      }
      const gain = computeSidechainGain(env.envelopeDb, -24, 4);
      expect(gain).toBe(1);
    });

    it('produces gain reduction when source exceeds threshold', () => {
      let env = createEnvelopeFollowerState();
      for (let i = 0; i < 300; i++) {
        env = updateEnvelope(env, -12, 0.01, 0.2, 1 / 60);
      }
      const gain = computeSidechainGain(env.envelopeDb, -24, 4);
      expect(gain).toBeLessThan(1);
      expect(gain).toBeGreaterThan(0);
    });

    it('recovers gain after source drops below threshold', () => {
      let env = createEnvelopeFollowerState();
      for (let i = 0; i < 300; i++) {
        env = updateEnvelope(env, -12, 0.01, 0.2, 1 / 60);
      }
      const gainDucked = computeSidechainGain(env.envelopeDb, -24, 4);
      expect(gainDucked).toBeLessThan(1);

      for (let i = 0; i < 600; i++) {
        env = updateEnvelope(env, -60, 0.01, 0.2, 1 / 60);
      }
      const gainRecovered = computeSidechainGain(env.envelopeDb, -24, 4);
      expect(gainRecovered).toBe(1);
    });

    it('applies correct gain reduction for known values', () => {
      let env = createEnvelopeFollowerState();
      for (let i = 0; i < 600; i++) {
        env = updateEnvelope(env, -12, 0.001, 0.2, 1 / 60);
      }
      expect(env.envelopeDb).toBeCloseTo(-12, 0);

      const gain = computeSidechainGain(env.envelopeDb, -24, 4);
      const expectedGain = Math.pow(10, -9 / 20);
      expect(gain).toBeCloseTo(expectedGain, 1);
    });
  });
});
