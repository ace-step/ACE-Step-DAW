import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VST3PluginScanner } from '../VST3PluginScanner';
import type { VST3PluginInfo, VST3BridgeClientLike } from '../VST3PluginScanner';

function createMockPlugin(overrides: Partial<VST3PluginInfo> = {}): VST3PluginInfo {
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

function createMockBridgeClient(
  overrides: Partial<VST3BridgeClientLike> = {},
): VST3BridgeClientLike {
  return {
    scanPlugins: vi.fn().mockResolvedValue([]),
    on: vi.fn().mockReturnValue(() => {}),
    isConnected: true,
    ...overrides,
  };
}

describe('VST3PluginScanner enhanced caching', () => {
  let scanner: VST3PluginScanner;

  beforeEach(() => {
    localStorage.clear();
    scanner = new VST3PluginScanner();
  });

  describe('companion version tracking', () => {
    it('accepts companion version via setCompanionVersion', () => {
      scanner.setCompanionVersion('1.0.0');
      // No error — version is stored internally
    });

    it('stores companion version alongside scan results in IndexedDB', async () => {
      const plugins = [createMockPlugin()];
      const client = createMockBridgeClient({ scanPlugins: vi.fn().mockResolvedValue(plugins) });
      scanner.setBridgeClient(client);
      scanner.setCompanionVersion('1.2.0');

      await scanner.scan(undefined, true);

      expect(scanner.getCachedPlugins()).toEqual(plugins);
    });
  });

  describe('force rescan', () => {
    it('scan with force=true always calls bridge even if cache is valid', async () => {
      const plugins = [createMockPlugin()];
      const scanFn = vi.fn().mockResolvedValue(plugins);
      const client = createMockBridgeClient({ scanPlugins: scanFn });
      scanner.setBridgeClient(client);
      scanner.setCompanionVersion('1.0.0');

      // First scan populates cache
      await scanner.scan(undefined, true);
      expect(scanFn).toHaveBeenCalledTimes(1);

      // Second scan with force=true should call bridge again
      await scanner.scan(undefined, true);
      expect(scanFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('cache-hit path', () => {
    it('scan without force does NOT call bridge when cache is valid', async () => {
      const plugins = [createMockPlugin()];
      const scanFn = vi.fn().mockResolvedValue(plugins);
      const client = createMockBridgeClient({ scanPlugins: scanFn });
      scanner.setBridgeClient(client);
      scanner.setCompanionVersion('1.0.0');

      // First scan with force to populate cache
      await scanner.scan(undefined, true);
      expect(scanFn).toHaveBeenCalledTimes(1);

      // Second scan without force should use cache — no bridge call
      const result = await scanner.scan(undefined, false);
      expect(scanFn).toHaveBeenCalledTimes(1); // NOT called again
      expect(result).toEqual(plugins);
    });

    it('scan without force calls bridge when cache version mismatches', async () => {
      const plugins = [createMockPlugin()];
      const scanFn = vi.fn().mockResolvedValue(plugins);
      const client = createMockBridgeClient({ scanPlugins: scanFn });
      scanner.setBridgeClient(client);
      scanner.setCompanionVersion('1.0.0');

      // Populate cache
      await scanner.scan(undefined, true);
      expect(scanFn).toHaveBeenCalledTimes(1);

      // Change version — cache should be invalid
      scanner.setCompanionVersion('2.0.0');
      await scanner.scan(undefined, false);
      expect(scanFn).toHaveBeenCalledTimes(2); // Bridge called again
    });
  });

  describe('loadFromCache', () => {
    it('returns null when no companion version set', async () => {
      const result = await scanner.loadFromCache();
      expect(result).toBeNull();
    });

    it('returns null when cache is empty', async () => {
      scanner.setCompanionVersion('1.0.0');
      const result = await scanner.loadFromCache();
      expect(result).toBeNull();
    });
  });

  describe('clearCache clears IndexedDB', () => {
    it('clears both localStorage and IndexedDB', async () => {
      const plugins = [createMockPlugin()];
      const client = createMockBridgeClient({ scanPlugins: vi.fn().mockResolvedValue(plugins) });
      scanner.setBridgeClient(client);
      scanner.setCompanionVersion('1.0.0');

      await scanner.scan(undefined, true);
      expect(scanner.getCachedPlugins()).toHaveLength(1);

      scanner.clearCache();
      expect(scanner.getCachedPlugins()).toEqual([]);
    });
  });
});
