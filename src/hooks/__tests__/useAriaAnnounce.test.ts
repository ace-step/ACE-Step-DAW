import { describe, it, expect, afterEach } from 'vitest';
import { announceToScreenReader } from '../useAriaAnnounce';

describe('useAriaAnnounce', () => {
  afterEach(() => {
    const el = document.querySelector('[data-testid="sr-value-announce"]');
    if (el) el.remove();
  });

  describe('announceToScreenReader', () => {
    it('creates a global aria-live region on first call', async () => {
      announceToScreenReader('test message');
      const region = document.querySelector('[data-testid="sr-value-announce"]');
      expect(region).toBeTruthy();
      expect(region!.getAttribute('role')).toBe('status');
      expect(region!.getAttribute('aria-live')).toBe('polite');
      expect(region!.getAttribute('aria-atomic')).toBe('true');
    });

    it('sets message text after rAF', async () => {
      announceToScreenReader('Volume: 50%');
      await new Promise((r) => requestAnimationFrame(r));
      const region = document.querySelector('[data-testid="sr-value-announce"]');
      expect(region!.textContent).toBe('Volume: 50%');
    });

    it('reuses the same live region for multiple calls', async () => {
      announceToScreenReader('first');
      await new Promise((r) => requestAnimationFrame(r));
      announceToScreenReader('second');
      await new Promise((r) => requestAnimationFrame(r));
      const regions = document.querySelectorAll('[data-testid="sr-value-announce"]');
      expect(regions.length).toBe(1);
      expect(regions[0].textContent).toBe('second');
    });
  });
});
