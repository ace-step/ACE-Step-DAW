import { describe, it, expect, afterEach, vi } from 'vitest';
import { isTauri, invokeTauri } from '../tauri';

describe('tauri bridge utilities', () => {
  afterEach(() => {
    if (typeof window !== 'undefined') {
      delete (window as Record<string, unknown>).__TAURI__;
    }
    vi.restoreAllMocks();
  });

  describe('isTauri', () => {
    it('returns false when __TAURI__ is not on window', () => {
      expect(isTauri()).toBe(false);
    });

    it('returns true when __TAURI__ is on window', () => {
      (window as Record<string, unknown>).__TAURI__ = {};
      expect(isTauri()).toBe(true);
    });
  });

  describe('invokeTauri', () => {
    it('returns null when not running in Tauri', async () => {
      const result = await invokeTauri('greet', { name: 'test' });
      expect(result).toBeNull();
    });

    it('does not attempt dynamic import when not in Tauri', async () => {
      // Ensure __TAURI__ is absent
      delete (window as Record<string, unknown>).__TAURI__;
      const result = await invokeTauri('some_command');
      expect(result).toBeNull();
    });

    it('returns null for missing args when not in Tauri', async () => {
      const result = await invokeTauri('is_desktop');
      expect(result).toBeNull();
    });
  });
});
