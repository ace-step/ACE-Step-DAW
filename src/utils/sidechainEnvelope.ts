/**
 * Pure utility functions for sidechain compression envelope following.
 */

export interface EnvelopeFollowerState {
  envelopeDb: number;
}

export function createEnvelopeFollowerState(): EnvelopeFollowerState {
  return { envelopeDb: -100 };
}

export function updateEnvelope(
  state: EnvelopeFollowerState,
  sourceDb: number,
  attackSec: number,
  releaseSec: number,
  dtSec: number,
): EnvelopeFollowerState {
  const timeSec = sourceDb > state.envelopeDb ? attackSec : releaseSec;
  const coeff = 1 - Math.exp(-dtSec / Math.max(timeSec, 0.0001));
  const envelopeDb = state.envelopeDb + coeff * (sourceDb - state.envelopeDb);
  return { envelopeDb };
}

export function computeSidechainGain(
  sourceLevelDb: number,
  thresholdDb: number,
  ratio: number,
): number {
  if (sourceLevelDb <= thresholdDb || ratio <= 1) return 1;
  const overDb = sourceLevelDb - thresholdDb;
  const reductionDb = overDb * (1 - 1 / ratio);
  return Math.pow(10, -reductionDb / 20);
}
