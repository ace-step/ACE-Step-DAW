import { describe, expect, it } from 'vitest';
import { getEngineForInstrument, PhysicalModelingEngineAdapter } from '../../src/engine/InstrumentFactory';
import type { PhysicalModelingTrackInstrument } from '../../src/types/project';
import { DEFAULT_PHYSICAL_MODELING_SETTINGS } from '../../src/engine/PhysicalModelingEngine';

describe('InstrumentFactory — physical modeling', () => {
  it('returns the PhysicalModelingEngineAdapter for physical instruments', () => {
    const instrument: PhysicalModelingTrackInstrument = {
      kind: 'physical',
      preset: 'physical',
      name: 'Test Physical',
      settings: { ...DEFAULT_PHYSICAL_MODELING_SETTINGS },
    };
    const engine = getEngineForInstrument(instrument);
    expect(engine).toBeInstanceOf(PhysicalModelingEngineAdapter);
  });
});
