import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VST3PluginScanner } from '../VST3PluginScanner';
import type { VST3PluginInfo, VST3BridgeClientLike } from '../VST3PluginScanner';

const CACHE_KEY = 'ace-step-vst3-scan-cache';

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

describe('VST3PluginScanner', () => {
  let scanner: VST3PluginScanner;

  beforeEach(() => {
    localStorage.clear();
    scanner = new VST3PluginScanner();
  });

  // 1. scan() returns plugins from bridge client
  describe('scan()', () => {
    it('returns plugins from bridge client', async () => {
      const plugins = [createMockPlugin(), createMockPlugin({ uid: 'uid-2', name: 'EQ Pro' })];
      const client = createMockBridgeClient({ scanPlugins: vi.fn().mockResolvedValue(plugins) });
      scanner.setBridgeClient(client);

      const result = await scanner.scan();

      expect(result).toEqual(plugins);
      expect(client.scanPlugins).toHaveBeenCalledOnce();
    });

    it('throws if bridge client is not set', async () => {
      await expect(scanner.scan()).rejects.toThrow('Bridge client not set');
    });

    it('throws if bridge client is disconnected', async () => {
      const client = createMockBridgeClient({
        get isConnected() {
          return false;
        },
      });
      scanner.setBridgeClient(client);

      await expect(scanner.scan()).rejects.toThrow('Bridge client is not connected');
    });

    it('forwards scan_progress events to onProgress callback', async () => {
      const onProgress = vi.fn();
      let progressHandler: ((msg: any) => void) | null = null;

      const client = createMockBridgeClient({
        scanPlugins: vi.fn().mockImplementation(async () => {
          // Simulate progress events during scan
          if (progressHandler) {
            progressHandler({ found: 1, current: 'Plugin A' });
            progressHandler({ found: 2, current: 'Plugin B' });
          }
          return [createMockPlugin()];
        }),
        on: vi.fn().mockImplementation((type: string, handler: (msg: any) => void) => {
          if (type === 'scan_progress') {
            progressHandler = handler;
          }
          return () => {
            progressHandler = null;
          };
        }),
      });

      scanner.setBridgeClient(client);
      await scanner.scan(onProgress);

      expect(onProgress).toHaveBeenCalledWith(1, 'Plugin A');
      expect(onProgress).toHaveBeenCalledWith(2, 'Plugin B');
    });
  });

  // 2. Results cached in localStorage
  describe('localStorage caching', () => {
    it('saves scan results to localStorage', async () => {
      const plugins = [createMockPlugin()];
      const client = createMockBridgeClient({ scanPlugins: vi.fn().mockResolvedValue(plugins) });
      scanner.setBridgeClient(client);

      await scanner.scan();

      const cached = JSON.parse(localStorage.getItem(CACHE_KEY)!);
      expect(cached.plugins).toEqual(plugins);
      expect(cached.timestamp).toBeTypeOf('number');
    });

    it('loads cached results from localStorage on construction', () => {
      const plugins = [createMockPlugin()];
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ plugins, timestamp: Date.now() }),
      );

      const newScanner = new VST3PluginScanner();
      expect(newScanner.getCachedPlugins()).toEqual(plugins);
    });
  });

  // 3. getCachedPlugins() returns cached data
  describe('getCachedPlugins()', () => {
    it('returns empty array when no cache', () => {
      expect(scanner.getCachedPlugins()).toEqual([]);
    });

    it('returns cached plugins after scan', async () => {
      const plugins = [createMockPlugin()];
      const client = createMockBridgeClient({ scanPlugins: vi.fn().mockResolvedValue(plugins) });
      scanner.setBridgeClient(client);

      await scanner.scan();

      expect(scanner.getCachedPlugins()).toEqual(plugins);
    });
  });

  // 4. isCacheStale() returns true after 24h
  describe('isCacheStale()', () => {
    it('returns true when no cache exists', () => {
      expect(scanner.isCacheStale()).toBe(true);
    });

    it('returns false when cache is fresh', async () => {
      const client = createMockBridgeClient({
        scanPlugins: vi.fn().mockResolvedValue([createMockPlugin()]),
      });
      scanner.setBridgeClient(client);
      await scanner.scan();

      expect(scanner.isCacheStale()).toBe(false);
    });

    it('returns true when cache is older than 24 hours', () => {
      const oldTimestamp = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ plugins: [createMockPlugin()], timestamp: oldTimestamp }),
      );

      const newScanner = new VST3PluginScanner();
      expect(newScanner.isCacheStale()).toBe(true);
    });
  });

  // 5. search() matches name, vendor, subcategory (case-insensitive)
  describe('search()', () => {
    const plugins = [
      createMockPlugin({ uid: '1', name: 'Super Synth', vendor: 'Acme Audio', subcategory: 'Synthesizer' }),
      createMockPlugin({ uid: '2', name: 'EQ Master', vendor: 'Pro Audio', subcategory: 'Equalizer', category: 'effect' }),
      createMockPlugin({ uid: '3', name: 'Delay Pro', vendor: 'Acme Audio', subcategory: 'Delay', category: 'effect' }),
    ];

    beforeEach(async () => {
      const client = createMockBridgeClient({ scanPlugins: vi.fn().mockResolvedValue(plugins) });
      scanner.setBridgeClient(client);
      await scanner.scan();
    });

    it('matches by name (case-insensitive)', () => {
      expect(scanner.search('super')).toEqual([plugins[0]]);
    });

    it('matches by vendor (case-insensitive)', () => {
      expect(scanner.search('pro audio')).toEqual([plugins[1]]);
    });

    it('matches by subcategory (case-insensitive)', () => {
      expect(scanner.search('equalizer')).toEqual([plugins[1]]);
    });

    it('returns empty array for no match', () => {
      expect(scanner.search('nonexistent')).toEqual([]);
    });

    // 6. search() with multiple terms (AND logic)
    it('supports space-separated terms with AND logic', () => {
      expect(scanner.search('acme synth')).toEqual([plugins[0]]);
    });

    it('AND logic filters correctly when terms span fields', () => {
      expect(scanner.search('acme delay')).toEqual([plugins[2]]);
    });
  });

  // 7. getByCategory() filters correctly
  describe('getByCategory()', () => {
    const plugins = [
      createMockPlugin({ uid: '1', name: 'Synth', category: 'instrument' }),
      createMockPlugin({ uid: '2', name: 'EQ', category: 'effect' }),
      createMockPlugin({ uid: '3', name: 'Comp', category: 'effect' }),
    ];

    beforeEach(async () => {
      const client = createMockBridgeClient({ scanPlugins: vi.fn().mockResolvedValue(plugins) });
      scanner.setBridgeClient(client);
      await scanner.scan();
    });

    it('filters instruments', () => {
      const result = scanner.getByCategory('instrument');
      expect(result).toEqual([plugins[0]]);
    });

    it('filters effects', () => {
      const result = scanner.getByCategory('effect');
      expect(result).toEqual([plugins[1], plugins[2]]);
    });
  });

  // 8. getVendors() returns unique list
  describe('getVendors()', () => {
    it('returns unique vendor list', async () => {
      const plugins = [
        createMockPlugin({ uid: '1', vendor: 'Acme' }),
        createMockPlugin({ uid: '2', vendor: 'Pro Audio' }),
        createMockPlugin({ uid: '3', vendor: 'Acme' }),
      ];
      const client = createMockBridgeClient({ scanPlugins: vi.fn().mockResolvedValue(plugins) });
      scanner.setBridgeClient(client);
      await scanner.scan();

      const vendors = scanner.getVendors();
      expect(vendors).toEqual(['Acme', 'Pro Audio']);
    });

    it('returns empty array when no plugins', () => {
      expect(scanner.getVendors()).toEqual([]);
    });
  });

  // 8b. getSubcategories() returns unique list
  describe('getSubcategories()', () => {
    it('returns unique subcategory list', async () => {
      const plugins = [
        createMockPlugin({ uid: '1', subcategory: 'Synthesizer' }),
        createMockPlugin({ uid: '2', subcategory: 'Equalizer' }),
        createMockPlugin({ uid: '3', subcategory: 'Synthesizer' }),
      ];
      const client = createMockBridgeClient({ scanPlugins: vi.fn().mockResolvedValue(plugins) });
      scanner.setBridgeClient(client);
      await scanner.scan();

      expect(scanner.getSubcategories()).toEqual(['Synthesizer', 'Equalizer']);
    });
  });

  // 9. clearCache() removes from localStorage
  describe('clearCache()', () => {
    it('removes plugins from memory and localStorage', async () => {
      const plugins = [createMockPlugin()];
      const client = createMockBridgeClient({ scanPlugins: vi.fn().mockResolvedValue(plugins) });
      scanner.setBridgeClient(client);
      await scanner.scan();

      scanner.clearCache();

      expect(scanner.getCachedPlugins()).toEqual([]);
      expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    });
  });
});
