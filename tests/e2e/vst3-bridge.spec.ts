/**
 * VST3 Bridge Integration Tests
 *
 * Tests the VST3 companion bridge infrastructure using store-based
 * assertions. Validates plugin CRUD, parameter updates, state persistence,
 * and SharedArrayBuffer availability.
 *
 * Persona: producer with VST3 plugins installed
 * Why this test exists: validates VST3 integration at the store/engine level
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(
    () => typeof (window as any).__store !== 'undefined',
    null,
    { timeout: 10000 },
  );
  await page.evaluate(() => {
    const uiStore = (window as any).__uiStore;
    if (uiStore) uiStore.getState().setShowNewProjectDialog(false);
    const store = (window as any).__store;
    store.getState().createProject({ name: 'VST3 Test' });
  });
});

test.describe('VST3 Plugin Store Operations', () => {
  test('can add a VST3 effect plugin to a track', async ({ page }) => {
    const result = await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().addTrack('pianoRoll');
      const trackId = store.getState().project?.tracks[0]?.id;

      store.getState().addPlugin(trackId, {
        id: 'vst3-effect-1',
        pluginId: 'vst3:mock-reverb-001',
        enabled: true,
        params: { '0': 0.5, '1': 0.7, '2': 2.5 },
        manifest: {
          id: 'vst3:mock-reverb-001',
          name: 'Mock Reverb',
          pluginType: 'effect',
          version: '1.0',
          author: 'Test Audio',
          description: 'VST3 reverb effect',
          parameters: [],
        },
        isVST3: true,
        vst3Uid: 'mock-reverb-001',
      });

      const track = store.getState().project?.tracks[0];
      const plugin = track?.plugins?.[0];
      return {
        pluginCount: track?.plugins?.length ?? 0,
        pluginId: plugin?.pluginId,
        pluginName: plugin?.manifest?.name,
        isVST3: plugin?.isVST3,
        vst3Uid: plugin?.vst3Uid,
        enabled: plugin?.enabled,
        paramMix: plugin?.params?.['0'],
      };
    });

    expect(result.pluginCount).toBe(1);
    expect(result.pluginId).toBe('vst3:mock-reverb-001');
    expect(result.pluginName).toBe('Mock Reverb');
    expect(result.isVST3).toBe(true);
    expect(result.vst3Uid).toBe('mock-reverb-001');
    expect(result.enabled).toBe(true);
    expect(result.paramMix).toBe(0.5);
  });

  test('can add a VST3 instrument plugin', async ({ page }) => {
    const result = await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().addTrack('pianoRoll');
      const trackId = store.getState().project?.tracks[0]?.id;

      store.getState().addPlugin(trackId, {
        id: 'vst3-synth-1',
        pluginId: 'vst3:mock-synth-001',
        enabled: true,
        params: {},
        manifest: {
          id: 'vst3:mock-synth-001',
          name: 'Mock Synth',
          pluginType: 'instrument',
          version: '1.0',
          author: 'Test Audio',
          description: 'VST3 synthesizer',
          parameters: [],
        },
        isVST3: true,
        vst3Uid: 'mock-synth-001',
      });

      const plugin = store.getState().project?.tracks[0]?.plugins?.[0];
      return {
        type: plugin?.manifest?.pluginType,
        name: plugin?.manifest?.name,
      };
    });

    expect(result.type).toBe('instrument');
    expect(result.name).toBe('Mock Synth');
  });

  test('can remove a VST3 plugin from a track', async ({ page }) => {
    const result = await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().addTrack('pianoRoll');
      const trackId = store.getState().project?.tracks[0]?.id;

      store.getState().addPlugin(trackId, {
        id: 'vst3-to-remove',
        pluginId: 'vst3:mock-eq-001',
        enabled: true,
        params: {},
        manifest: {
          id: 'vst3:mock-eq-001',
          name: 'Mock EQ',
          pluginType: 'effect',
          version: '1.0',
          author: 'Test',
          description: '',
          parameters: [],
        },
      });

      const countBefore = store.getState().project?.tracks[0]?.plugins?.length ?? 0;
      store.getState().removePlugin(trackId, 'vst3-to-remove');
      const countAfter = store.getState().project?.tracks[0]?.plugins?.length ?? 0;

      return { countBefore, countAfter };
    });

    expect(result.countBefore).toBe(1);
    expect(result.countAfter).toBe(0);
  });

  test('can update VST3 plugin parameters', async ({ page }) => {
    const result = await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().addTrack('pianoRoll');
      const trackId = store.getState().project?.tracks[0]?.id;

      store.getState().addPlugin(trackId, {
        id: 'vst3-param-test',
        pluginId: 'vst3:mock-reverb-001',
        enabled: true,
        params: { '0': 0.5, '1': 0.7 },
        manifest: {
          id: 'vst3:mock-reverb-001',
          name: 'Mock Reverb',
          pluginType: 'effect',
          version: '1.0',
          author: 'Test',
          description: '',
          parameters: [],
        },
      });

      // Update parameters
      store.getState().updatePluginParam(trackId, 'vst3-param-test', '0', 0.9);
      store.getState().updatePluginParam(trackId, 'vst3-param-test', '1', 0.3);

      const plugin = store.getState().project?.tracks[0]?.plugins?.[0];
      return {
        mix: plugin?.params?.['0'],
        size: plugin?.params?.['1'],
      };
    });

    expect(result.mix).toBe(0.9);
    expect(result.size).toBe(0.3);
  });

  test('multiple VST3 plugins can coexist on a track', async ({ page }) => {
    const result = await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().addTrack('pianoRoll');
      const trackId = store.getState().project?.tracks[0]?.id;

      // Add 3 plugins
      for (let i = 0; i < 3; i++) {
        store.getState().addPlugin(trackId, {
          id: `chain-plugin-${i}`,
          pluginId: `vst3:plugin-${i}`,
          enabled: true,
          params: {},
          manifest: {
            id: `vst3:plugin-${i}`,
            name: `Plugin ${i}`,
            pluginType: 'effect',
            version: '1.0',
            author: 'Test',
            description: '',
            parameters: [],
          },
        });
      }

      const plugins = store.getState().project?.tracks[0]?.plugins ?? [];
      return {
        count: plugins.length,
        names: plugins.map((p: any) => p.manifest.name),
      };
    });

    expect(result.count).toBe(3);
    expect(result.names).toEqual(['Plugin 0', 'Plugin 1', 'Plugin 2']);
  });
});

test.describe('VST3 State Persistence', () => {
  test('VST3 state fields survive serialization round-trip', async ({ page }) => {
    const result = await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().addTrack('pianoRoll');
      const trackId = store.getState().project?.tracks[0]?.id;

      store.getState().addPlugin(trackId, {
        id: 'persist-test',
        pluginId: 'vst3:mock-reverb-001',
        enabled: true,
        params: { '0': 0.75 },
        manifest: {
          id: 'vst3:mock-reverb-001',
          name: 'Mock Reverb',
          pluginType: 'effect',
          version: '1.0',
          author: 'Test Audio',
          description: '',
          parameters: [],
        },
        isVST3: true,
        vst3Uid: 'mock-reverb-001',
        vst3State: btoa('mock-vst3-binary-state'),
      });

      // Serialize and deserialize
      const plugin = store.getState().project?.tracks[0]?.plugins?.[0];
      const serialized = JSON.stringify(plugin);
      const deserialized = JSON.parse(serialized);

      return {
        isVST3: deserialized.isVST3,
        vst3Uid: deserialized.vst3Uid,
        vst3State: deserialized.vst3State,
        stateDecoded: atob(deserialized.vst3State),
        params: deserialized.params,
      };
    });

    expect(result.isVST3).toBe(true);
    expect(result.vst3Uid).toBe('mock-reverb-001');
    expect(result.stateDecoded).toBe('mock-vst3-binary-state');
    expect(result.params['0']).toBe(0.75);
  });

  test('non-VST3 plugins without vst3 fields load fine (backward compat)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().addTrack('pianoRoll');
      const trackId = store.getState().project?.tracks[0]?.id;

      // Add a regular WAP plugin (no VST3 fields)
      store.getState().addPlugin(trackId, {
        id: 'wap-plugin-1',
        pluginId: 'ace-bitcrusher',
        enabled: true,
        params: { bitDepth: 8 },
        manifest: {
          id: 'ace-bitcrusher',
          name: 'Bit Crusher',
          pluginType: 'effect',
          version: '1.0',
          author: 'ACE',
          description: '',
          parameters: [],
        },
      });

      const plugin = store.getState().project?.tracks[0]?.plugins?.[0];
      return {
        name: plugin?.manifest?.name,
        isVST3: plugin?.isVST3,
        vst3Uid: plugin?.vst3Uid,
      };
    });

    expect(result.name).toBe('Bit Crusher');
    expect(result.isVST3).toBeUndefined();
    expect(result.vst3Uid).toBeUndefined();
  });
});

test.describe('SharedArrayBuffer Support', () => {
  test('SharedArrayBuffer is available (COOP/COEP headers)', async ({ page }) => {
    const result = await page.evaluate(() => {
      return {
        hasSAB: typeof SharedArrayBuffer !== 'undefined',
        crossOriginIsolated: (self as any).crossOriginIsolated === true,
      };
    });
    // SharedArrayBuffer should be available with COOP/COEP headers
    expect(result.hasSAB).toBe(true);
  });

  test('can allocate SharedArrayBuffer for audio ring buffer', async ({ page }) => {
    const result = await page.evaluate(() => {
      try {
        // Simulate ring buffer allocation: 4 blocks × 128 samples × 2 channels × 4 bytes + 8 header
        const bufferSize = 8 + 4 * 128 * 2 * 4;
        const sab = new SharedArrayBuffer(bufferSize);
        const int32View = new Int32Array(sab, 0, 2);
        const float32View = new Float32Array(sab, 8);

        // Write and read test values
        Atomics.store(int32View, 0, 0); // write head
        Atomics.store(int32View, 1, 0); // read head
        float32View[0] = 1.0;
        float32View[1] = -1.0;

        return {
          success: true,
          size: sab.byteLength,
          writeHead: Atomics.load(int32View, 0),
          readHead: Atomics.load(int32View, 1),
          sample0: float32View[0],
          sample1: float32View[1],
        };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.size).toBe(8 + 4 * 128 * 2 * 4);
      expect(result.writeHead).toBe(0);
      expect(result.sample0).toBe(1.0);
      expect(result.sample1).toBe(-1.0);
    }
  });
});
