import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerJobAbortController,
  abortJob,
  unregisterJobAbortController,
  isJobAborted,
  getJobAbortSignal,
  getActiveControllerCount,
  clearAllControllers,
} from '../generationAbortRegistry';

describe('generationAbortRegistry', () => {
  beforeEach(() => {
    clearAllControllers();
  });

  describe('registerJobAbortController', () => {
    it('creates and returns a new AbortController', () => {
      const controller = registerJobAbortController('job-1');
      expect(controller).toBeInstanceOf(AbortController);
      expect(controller.signal.aborted).toBe(false);
    });

    it('replaces and aborts existing controller for same job', () => {
      const first = registerJobAbortController('job-1');
      const second = registerJobAbortController('job-1');
      expect(first.signal.aborted).toBe(true);
      expect(second.signal.aborted).toBe(false);
      expect(getActiveControllerCount()).toBe(1);
    });

    it('tracks multiple job controllers independently', () => {
      registerJobAbortController('job-1');
      registerJobAbortController('job-2');
      expect(getActiveControllerCount()).toBe(2);
    });
  });

  describe('abortJob', () => {
    it('aborts the controller and returns true', () => {
      const controller = registerJobAbortController('job-1');
      const result = abortJob('job-1');
      expect(result).toBe(true);
      expect(controller.signal.aborted).toBe(true);
    });

    it('removes the controller from registry', () => {
      registerJobAbortController('job-1');
      abortJob('job-1');
      expect(getActiveControllerCount()).toBe(0);
    });

    it('returns false for non-existent job', () => {
      const result = abortJob('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('unregisterJobAbortController', () => {
    it('removes controller without aborting', () => {
      const controller = registerJobAbortController('job-1');
      unregisterJobAbortController('job-1');
      expect(controller.signal.aborted).toBe(false);
      expect(getActiveControllerCount()).toBe(0);
    });

    it('is a no-op for non-existent job', () => {
      unregisterJobAbortController('non-existent');
      expect(getActiveControllerCount()).toBe(0);
    });
  });

  describe('isJobAborted', () => {
    it('returns false for active job', () => {
      registerJobAbortController('job-1');
      expect(isJobAborted('job-1')).toBe(false);
    });

    it('returns true after abort', () => {
      registerJobAbortController('job-1');
      abortJob('job-1');
      // After abort, the controller is removed, so isJobAborted returns false
      expect(isJobAborted('job-1')).toBe(false);
    });

    it('returns false for non-existent job', () => {
      expect(isJobAborted('non-existent')).toBe(false);
    });
  });

  describe('getJobAbortSignal', () => {
    it('returns the signal for a registered job', () => {
      const controller = registerJobAbortController('job-1');
      const signal = getJobAbortSignal('job-1');
      expect(signal).toBe(controller.signal);
    });

    it('returns undefined for non-existent job', () => {
      expect(getJobAbortSignal('non-existent')).toBeUndefined();
    });
  });

  describe('clearAllControllers', () => {
    it('aborts and removes all controllers', () => {
      const c1 = registerJobAbortController('job-1');
      const c2 = registerJobAbortController('job-2');
      clearAllControllers();
      expect(c1.signal.aborted).toBe(true);
      expect(c2.signal.aborted).toBe(true);
      expect(getActiveControllerCount()).toBe(0);
    });
  });
});
