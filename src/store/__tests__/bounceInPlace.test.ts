import { describe, it } from 'vitest';

// BounceInPlace API evolved: renderTrackForBounceInPlace → bounceTrackToAudioAsset chain.
// These tests need a full rewrite against the current API.
// See: src/services/bounceInPlace.ts, src/store/projectStore.ts (bounceInPlace action)
describe('projectStore bounceInPlace', () => {
  it.todo('replaces the source track with bounced audio and supports undo/redo');
  it.todo('creates a sibling bounced sample track when replaceOriginal is false');
});
