import { describe, it } from 'vitest';

// BounceInPlace service evolved — renderTrackForBounceInPlace was replaced by
// renderTrackSourceBuffer → bounceTrackToAudioAsset pipeline.
// See: src/services/bounceInPlace.ts for current API.
describe('bounceInPlace service', () => {
  it.todo('renders a synth track to audio with correct timing');
  it.todo('includes effects chain when includeEffects is true');
  it.todo('handles empty tracks gracefully');
});
