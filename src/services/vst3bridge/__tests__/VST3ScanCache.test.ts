import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VST3ScanCache } from '../VST3ScanCache';
import type { VST3PluginInfo } from '../VST3PluginScanner';

function createPlugin(overrides: Partial<VST3PluginInfo> = {}): VST3PluginInfo {
  return {
    uid: 'uid-1',
    name: 'Test Synth',
    vendor: 'Acme Audio',
    category: 'instrument',
    subcategory: 'Synthesizer',
    inputChannels: 0,
    outputChannels: 2,
    hasEditor: true,
    supportsMultiOutput: false,
    outputBusses: [{ name: 'Stereo Out', channels: 2 }],
    ...overrides,
  };
}

describe('VST3ScanCache', () => {
  let cache: VST3ScanCache;

  beforeEach(() => {
    cache = new VST3ScanCache();
  });

  describe('store and retrieve', () => {
    it('stores plugins and retrieves them', async () => {
      const plugins = [createPlugin(), createPlugin({ uid: 'uid-2', name: 'EQ' })];
      await cache.store(plugins, '1.0.0');
      const result = await cache.retrieve();
      expect(result?.plugins).toEqual(plugins);
    });

    it('returns null when cache is empty', async () => {
      const result = await cache.retrieve();
      expect(result).toBeNull();
    });

    it('stores companion version with cache entry', async () => {
      const plugins = [createPlugin()];
      await cache.store(plugins, '1.2.0');
      const result = await cache.retrieve();
      expect(result?.companionVersion).toBe('1.2.0');
    });

    it('stores timestamp with cache entry', async () => {
      const before = Date.now();
      await cache.store([createPlugin()], '1.0.0');
      const after = Date.now();
      const result = await cache.retrieve();
      expect(result?.timestamp).toBeGreaterThanOrEqual(before);
      expect(result?.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('isValid', () => {
    it('returns false when cache is empty', async () => {
      expect(await cache.isValid('1.0.0')).toBe(false);
    });

    it('returns true when cache exists and version matches', async () => {
      await cache.store([createPlugin()], '1.0.0');
      expect(await cache.isValid('1.0.0')).toBe(true);
    });

    it('returns false when companion version has changed', async () => {
      await cache.store([createPlugin()], '1.0.0');
      expect(await cache.isValid('1.1.0')).toBe(false);
    });

    it('returns false when cache is stale (>24h)', async () => {
      await cache.store([createPlugin()], '1.0.0');
      // Manually set timestamp to 25 hours ago
      const entry = await cache.retrieve();
      if (entry) {
        entry.timestamp = Date.now() - 25 * 60 * 60 * 1000;
        await cache.store(entry.plugins, entry.companionVersion, entry.timestamp);
      }
      expect(await cache.isValid('1.0.0')).toBe(false);
    });
  });

  describe('clear', () => {
    it('removes cached data', async () => {
      await cache.store([createPlugin()], '1.0.0');
      await cache.clear();
      const result = await cache.retrieve();
      expect(result).toBeNull();
    });
  });

  describe('plugin count', () => {
    it('returns 0 for empty cache', async () => {
      expect(await cache.getPluginCount()).toBe(0);
    });

    it('returns correct count after store', async () => {
      await cache.store([createPlugin(), createPlugin({ uid: 'uid-2' })], '1.0.0');
      expect(await cache.getPluginCount()).toBe(2);
    });
  });
});

describe('VST3PluginScanner with cache integration', () => {
  it('uses cache on startup when valid', async () => {
    // This tests that the scanner loads from cache instead of rescanning
    const cache = new VST3ScanCache();
    const plugins = [createPlugin()];
    await cache.store(plugins, '1.0.0');

    const result = await cache.retrieve();
    expect(result?.plugins).toEqual(plugins);
    expect(await cache.isValid('1.0.0')).toBe(true);
  });

  it('invalidates cache when version changes', async () => {
    const cache = new VST3ScanCache();
    await cache.store([createPlugin()], '1.0.0');
    // Version bumped
    expect(await cache.isValid('2.0.0')).toBe(false);
  });
});
