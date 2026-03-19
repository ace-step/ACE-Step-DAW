import { describe, it, expect } from 'vitest';
import { computeSidechainGain, EnvelopeFollowerState, createEnvelopeFollowerState, updateEnvelope } from '../sidechainEnvelope';

describe('sidechain envelope follower', () => {
  describe('computeSidechainGain', () => {
    it('returns 1 (no reduction) when source level is below threshold', () => {
      const gain = computeSidechainGain(-40, -24, 4);
      expect(gain).toBe(1);
    });

    it('applies gain reduction when source level exceeds threshold', () => {
      const gain = computeSidechainGain(-12, -24, 4);
      const expectedReductionDb = 12 * (1 - 1 / 4);
      const expectedGain = Math.pow(10, -expectedReductionDb / 20);
      expect(gain).toBeCloseTo(expectedGain, 5);
    });

    it('returns 1 when ratio is 1 (no compression)', () => {
      const gain = computeSidechainGain(-12, -24, 1);
      expect(gain).toBe(1);
    });

    it('handles extreme ratio (limiter)', () => {
      const gain = computeSidechainGain(-12, -24, 20);
      const expectedReductionDb = 12 * (1 - 1 / 20);
      const expectedGain = Math.pow(10, -expectedReductionDb / 20);
      expect(gain).toBeCloseTo(expectedGain, 5);
    });

    it('returns exactly at threshold boundary', () => {
      const gain = computeSidechainGain(-24, -24, 4);
      expect(gain).toBe(1);
    });
  });

  describe('envelope follower state', () => {
    it('creates initial state with envelope at -100 dB', () => {
      const state = createEnvelopeFollowerState();
      expect(state.envelopeDb).toBe(-100);
    });

    it('attack: envelope rises toward source level', () => {
      const state = createEnvelopeFollowerState();
      const updated = updateEnvelope(state, -12, 0.01, 0.2, 1 / 60);
      expect(updated.envelopeDb).toBeGreaterThan(-100);
      expect(updated.envelopeDb).toBeLessThan(-12);
    });

    it('release: envelope falls when source drops', () => {
      const state: EnvelopeFollowerState = { envelopeDb: -12 };
      const updated = updateEnvelope(state, -60, 0.01, 0.2, 1 / 60);
      expect(updated.envelopeDb).toBeLessThan(-12);
      expect(updated.envelopeDb).toBeGreaterThan(-60);
    });

    it('converges to source level over many frames', () => {
      let state = createEnvelopeFollowerState();
      for (let i = 0; i < 120; i++) {
        state = updateEnvelope(state, -12, 0.01, 0.2, 1 / 60);
      }
      expect(state.envelopeDb).toBeCloseTo(-12, 0);
    });
  });
});
