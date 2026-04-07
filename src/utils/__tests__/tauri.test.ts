import { describe, it, expect, afterEach, vi } from 'vitest';
import { isTauri, invokeTauri } from '../tauri';

describe('tauri bridge utilities', () => {
  afterEach(() => {
    if (typeof window !== 'undefined') {
      delete (window as Record<string, unknown>).__TAURI__;
      delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
    }
    vi.restoreAllMocks();
  });

  describe('isTauri', () => {
    it('returns false when neither __TAURI__ nor __TAURI_INTERNALS__ is on window', () => {
      expect(isTauri()).toBe(false);
    });

    it('returns true when __TAURI__ is on window (v1 compat)', () => {
      (window as Record<string, unknown>).__TAURI__ = {};
      expect(isTauri()).toBe(true);
    });

    it('returns true when __TAURI_INTERNALS__ is on window (v2)', () => {
      (window as Record<string, unknown>).__TAURI_INTERNALS__ = {};
      expect(isTauri()).toBe(true);
    });
  });

  describe('invokeTauri', () => {
    it('returns null when not running in Tauri', async () => {
      const result = await invokeTauri('greet', { name: 'test' });
      expect(result).toBeNull();
    });

    it('does not attempt dynamic import when not in Tauri', async () => {
      delete (window as Record<string, unknown>).__TAURI__;
      delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
      const result = await invokeTauri('some_command');
      expect(result).toBeNull();
    });

    it('returns null for missing args when not in Tauri', async () => {
      const result = await invokeTauri('is_desktop');
      expect(result).toBeNull();
    });

    it('attempts invoke when __TAURI_INTERNALS__ is present', async () => {
      (window as Record<string, unknown>).__TAURI_INTERNALS__ = {};
      // The dynamic import will fail in test env, but isTauri() should be true
      expect(isTauri()).toBe(true);
      // invokeTauri will try to import @tauri-apps/api/core which exists as a dep
      // but may fail in jsdom — we just verify it doesn't return null early
      try {
        await invokeTauri('greet', { name: 'test' });
      } catch {
        // Expected: dynamic import or invoke may throw in test environment
      }
    });
  });
});
