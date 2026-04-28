import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useToastStore, showToast, toastSuccess, toastError, toastInfo } from '../useToast';

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToastStore.getState().clearToasts();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('showToast', () => {
    it('adds a toast to the store', () => {
      showToast({ type: 'info', message: 'Hello' });
      expect(useToastStore.getState().toasts).toHaveLength(1);
      expect(useToastStore.getState().toasts[0].message).toBe('Hello');
      expect(useToastStore.getState().toasts[0].type).toBe('info');
    });

    it('returns a unique id', () => {
      const id1 = showToast({ type: 'info', message: 'First' });
      const id2 = showToast({ type: 'info', message: 'Second' });
      expect(id1).not.toBe(id2);
    });

    it('uses default duration for info (3000ms)', () => {
      showToast({ type: 'info', message: 'Test' });
      expect(useToastStore.getState().toasts[0].durationMs).toBe(3000);
    });

    it('uses default duration for error (5000ms)', () => {
      showToast({ type: 'error', message: 'Error!' });
      expect(useToastStore.getState().toasts[0].durationMs).toBe(5000);
    });

    it('uses custom duration when provided', () => {
      showToast({ type: 'info', message: 'Custom', durationMs: 10000 });
      expect(useToastStore.getState().toasts[0].durationMs).toBe(10000);
    });

    it('auto-dismisses after duration', () => {
      showToast({ type: 'info', message: 'Dismiss me', durationMs: 2000 });
      expect(useToastStore.getState().toasts).toHaveLength(1);
      vi.advanceTimersByTime(2000);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it('supports multiple concurrent toasts', () => {
      showToast({ type: 'info', message: 'First' });
      showToast({ type: 'error', message: 'Second' });
      showToast({ type: 'success', message: 'Third' });
      expect(useToastStore.getState().toasts).toHaveLength(3);
    });
  });

  describe('dismissToast', () => {
    it('removes a specific toast', () => {
      const id = showToast({ type: 'info', message: 'Remove me' });
      showToast({ type: 'info', message: 'Keep me' });
      useToastStore.getState().dismissToast(id);
      expect(useToastStore.getState().toasts).toHaveLength(1);
      expect(useToastStore.getState().toasts[0].message).toBe('Keep me');
    });

    it('handles dismissing non-existent id gracefully', () => {
      showToast({ type: 'info', message: 'Test' });
      useToastStore.getState().dismissToast('non-existent');
      expect(useToastStore.getState().toasts).toHaveLength(1);
    });
  });

  describe('pauseToast / resumeToast', () => {
    it('pauses auto-dismiss timer', () => {
      const id = showToast({ type: 'info', message: 'Pause me', durationMs: 2000 });
      vi.advanceTimersByTime(1000);
      useToastStore.getState().pauseToast(id);
      vi.advanceTimersByTime(5000); // well past the original duration
      // Toast should still be present
      expect(useToastStore.getState().toasts).toHaveLength(1);
    });

    it('resumes auto-dismiss with remaining time', () => {
      const id = showToast({ type: 'info', message: 'Resume me', durationMs: 2000 });
      vi.advanceTimersByTime(1000);
      useToastStore.getState().pauseToast(id);
      vi.advanceTimersByTime(5000);
      expect(useToastStore.getState().toasts).toHaveLength(1);
      useToastStore.getState().resumeToast(id);
      // Remaining should be ~1000ms, but at least 500ms minimum
      vi.advanceTimersByTime(1500);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });
  });

  describe('clearToasts', () => {
    it('removes all toasts', () => {
      showToast({ type: 'info', message: 'One' });
      showToast({ type: 'error', message: 'Two' });
      showToast({ type: 'success', message: 'Three' });
      useToastStore.getState().clearToasts();
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it('cancels all pending timers', () => {
      showToast({ type: 'info', message: 'Timer 1', durationMs: 5000 });
      showToast({ type: 'info', message: 'Timer 2', durationMs: 5000 });
      useToastStore.getState().clearToasts();
      // No errors should occur when timers fire
      vi.advanceTimersByTime(10000);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });
  });

  describe('helper functions', () => {
    it('toastSuccess creates success toast', () => {
      toastSuccess('Done!');
      expect(useToastStore.getState().toasts[0].type).toBe('success');
      expect(useToastStore.getState().toasts[0].message).toBe('Done!');
    });

    it('toastError creates error toast', () => {
      toastError('Failed!');
      expect(useToastStore.getState().toasts[0].type).toBe('error');
      expect(useToastStore.getState().toasts[0].message).toBe('Failed!');
    });

    it('toastInfo creates info toast', () => {
      toastInfo('FYI');
      expect(useToastStore.getState().toasts[0].type).toBe('info');
      expect(useToastStore.getState().toasts[0].message).toBe('FYI');
    });

    it('toastSuccess supports custom duration', () => {
      toastSuccess('Done!', 8000);
      expect(useToastStore.getState().toasts[0].durationMs).toBe(8000);
    });
  });
});
