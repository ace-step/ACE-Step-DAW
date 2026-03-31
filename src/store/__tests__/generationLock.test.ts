import { describe, it, expect, beforeEach } from 'vitest';
import { useGenerationStore } from '../generationStore';

/**
 * Regression test for #1274: non-atomic isGenerating guard.
 * tryAcquireGenerationLock() must atomically check + set so that
 * concurrent calls cannot both succeed.
 */
describe('tryAcquireGenerationLock', () => {
  beforeEach(() => {
    useGenerationStore.setState({ isGenerating: false });
  });

  it('returns true on first call and sets isGenerating', () => {
    const acquired = useGenerationStore.getState().tryAcquireGenerationLock();
    expect(acquired).toBe(true);
    expect(useGenerationStore.getState().isGenerating).toBe(true);
  });

  it('returns false on second call (lock already held)', () => {
    const first = useGenerationStore.getState().tryAcquireGenerationLock();
    const second = useGenerationStore.getState().tryAcquireGenerationLock();
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('can be re-acquired after release', () => {
    useGenerationStore.getState().tryAcquireGenerationLock();
    useGenerationStore.getState().setIsGenerating(false);
    const reacquired = useGenerationStore.getState().tryAcquireGenerationLock();
    expect(reacquired).toBe(true);
  });

  it('100 concurrent calls: exactly one acquires the lock', () => {
    const results: boolean[] = [];
    for (let i = 0; i < 100; i++) {
      results.push(useGenerationStore.getState().tryAcquireGenerationLock());
    }
    const acquired = results.filter(Boolean);
    expect(acquired.length).toBe(1);
  });
});
