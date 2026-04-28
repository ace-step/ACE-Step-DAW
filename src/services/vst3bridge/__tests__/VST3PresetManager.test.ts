import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VST3PresetManager } from '../VST3PresetManager';
import type { VST3Preset } from '../VST3PresetManager';

// Mock idb-keyval
const mockStore = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: vi.fn((key: string) => Promise.resolve(mockStore.get(key))),
  set: vi.fn((key: string, value: unknown) => {
    mockStore.set(key, value);
    return Promise.resolve();
  }),
}));

function createMockBridge() {
  return {
    getState: vi.fn<(id: string) => Promise<string>>().mockResolvedValue('base64statedata=='),
    setState: vi.fn<(id: string, data: string) => Promise<void>>().mockResolvedValue(undefined),
    request: vi.fn().mockResolvedValue({}),
  };
}

describe('VST3PresetManager', () => {
  let manager: VST3PresetManager;
  let bridge: ReturnType<typeof createMockBridge>;

  beforeEach(() => {
    mockStore.clear();
    bridge = createMockBridge();
    manager = new VST3PresetManager(bridge);
    vi.clearAllMocks();
  });

  describe('getFactoryPresets', () => {
    it('returns presets from bridge', async () => {
      bridge.request.mockResolvedValue({
        presets: [
          { id: 0, name: 'Init' },
          { id: 1, name: 'Warm Pad' },
        ],
      });

      const presets = await manager.getFactoryPresets('inst-1');

      expect(bridge.request).toHaveBeenCalledWith({
        type: 'get_factory_presets',
        instanceId: 'inst-1',
      });
      expect(presets).toHaveLength(2);
      expect(presets[0]).toMatchObject({
        id: '0',
        name: 'Init',
        isFactory: true,
      });
      expect(presets[1]).toMatchObject({
        id: '1',
        name: 'Warm Pad',
        isFactory: true,
      });
    });
  });

  describe('loadFactoryPreset', () => {
    it('sends correct message to bridge', async () => {
      bridge.request.mockResolvedValue({});

      await manager.loadFactoryPreset('inst-1', 3);

      expect(bridge.request).toHaveBeenCalledWith({
        type: 'loadPreset',
        instanceId: 'inst-1',
        presetId: 3,
      });
    });
  });

  describe('saveUserPreset', () => {
    it('gets state from bridge and stores in IndexedDB', async () => {
      const preset = await manager.saveUserPreset('inst-1', 'com.plugin.synth', 'My Patch');

      expect(bridge.getState).toHaveBeenCalledWith('inst-1');
      expect(preset.name).toBe('My Patch');
      expect(preset.pluginUid).toBe('com.plugin.synth');
      expect(preset.isFactory).toBe(false);
      expect(preset.stateData).toBe('base64statedata==');
      expect(preset.id.length).toBeGreaterThan(0);
      expect(preset.createdAt).toBeTypeOf('number');
      expect(preset.updatedAt).toBeTypeOf('number');

      // Verify stored in IndexedDB under the plugin key
      const stored = mockStore.get('vst3-presets-com.plugin.synth') as VST3Preset[];
      expect(stored).toHaveLength(1);
      expect(stored[0].name).toBe('My Patch');
    });
  });

  describe('loadUserPreset', () => {
    it('sets state via bridge', async () => {
      const preset: VST3Preset = {
        id: 'preset-123',
        name: 'Saved Patch',
        pluginUid: 'com.plugin.synth',
        isFactory: false,
        stateData: 'savedstatedata==',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await manager.loadUserPreset('inst-1', preset);

      expect(bridge.setState).toHaveBeenCalledWith('inst-1', 'savedstatedata==');
    });
  });

  describe('getUserPresets', () => {
    it('returns stored presets for a plugin', async () => {
      // Save two presets first
      await manager.saveUserPreset('inst-1', 'com.plugin.synth', 'Patch A');
      await manager.saveUserPreset('inst-1', 'com.plugin.synth', 'Patch B');

      const presets = manager.getUserPresets('com.plugin.synth');

      expect(presets).toHaveLength(2);
      expect(presets[0].name).toBe('Patch A');
      expect(presets[1].name).toBe('Patch B');
    });

    it('returns empty array when no presets exist', () => {
      const presets = manager.getUserPresets('com.unknown.plugin');
      expect(presets).toEqual([]);
    });
  });

  describe('deleteUserPreset', () => {
    it('removes preset from store', async () => {
      const preset = await manager.saveUserPreset('inst-1', 'com.plugin.synth', 'To Delete');
      expect(manager.getUserPresets('com.plugin.synth')).toHaveLength(1);

      manager.deleteUserPreset(preset.id);

      expect(manager.getUserPresets('com.plugin.synth')).toHaveLength(0);
    });
  });

  describe('renameUserPreset', () => {
    it('updates preset name', async () => {
      const preset = await manager.saveUserPreset('inst-1', 'com.plugin.synth', 'Old Name');

      manager.renameUserPreset(preset.id, 'New Name');

      const presets = manager.getUserPresets('com.plugin.synth');
      expect(presets[0].name).toBe('New Name');
      expect(presets[0].updatedAt).toBeGreaterThanOrEqual(preset.updatedAt!);
    });
  });

  describe('exportPreset', () => {
    it('returns state data from bridge', async () => {
      bridge.getState.mockResolvedValue('exportedstate==');
      bridge.request.mockResolvedValue({ name: 'Current Preset' });

      const result = await manager.exportPreset('inst-1');

      expect(bridge.getState).toHaveBeenCalledWith('inst-1');
      expect(result.data).toBe('exportedstate==');
      expect(result.name).toBe('Current Preset');
    });
  });

  describe('importPreset', () => {
    it('sets state via bridge', async () => {
      await manager.importPreset('inst-1', 'importedstate==');

      expect(bridge.setState).toHaveBeenCalledWith('inst-1', 'importedstate==');
    });
  });
});
