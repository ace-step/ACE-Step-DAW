import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';
import type { PluginInstance } from '../../types/plugin';

vi.mock('../../services/projectStorage', () => ({ saveProject: vi.fn() }));

/** Helper: create a minimal VST3 PluginInstance. */
function makeVST3Plugin(overrides?: Partial<PluginInstance>): PluginInstance {
  return {
    id: 'vst3-inst-1',
    pluginId: 'fabfilter-pro-q3',
    enabled: true,
    params: {},
    manifest: {
      id: 'fabfilter-pro-q3',
      name: 'FabFilter Pro-Q 3',
      pluginType: 'effect',
      version: '3.0.0',
      author: 'FabFilter',
      description: 'Parametric EQ',
      parameters: [],
    },
    isVST3: true,
    vst3Uid: 'ABCD1234',
    vst3State: 'c29tZUJhc2U2NA==',
    ...overrides,
  };
}

/** Helper: create a minimal WAP (non-VST3) PluginInstance. */
function makeWAPPlugin(overrides?: Partial<PluginInstance>): PluginInstance {
  return {
    id: 'wap-inst-1',
    pluginId: 'ace-bitcrusher',
    enabled: true,
    params: { bits: 8 },
    manifest: {
      id: 'ace-bitcrusher',
      name: 'Bitcrusher',
      pluginType: 'effect',
      version: '1.0.0',
      author: 'ACE',
      description: 'Lo-fi effect',
      parameters: [],
    },
    ...overrides,
  };
}

describe('VST3 state persistence — PluginInstance type', () => {
  it('PluginInstance with VST3 fields serializes and deserializes correctly', () => {
    const instance = makeVST3Plugin();
    const json = JSON.stringify(instance);
    const parsed: PluginInstance = JSON.parse(json);

    expect(parsed.isVST3).toBe(true);
    expect(parsed.vst3Uid).toBe('ABCD1234');
    expect(parsed.vst3State).toBe('c29tZUJhc2U2NA==');
    expect(parsed.id).toBe('vst3-inst-1');
    expect(parsed.pluginId).toBe('fabfilter-pro-q3');
  });

  it('PluginInstance without VST3 fields serializes without extra keys', () => {
    const instance = makeWAPPlugin();
    const json = JSON.stringify(instance);
    const parsed: PluginInstance = JSON.parse(json);

    expect(parsed.isVST3).toBeUndefined();
    expect(parsed.vst3Uid).toBeUndefined();
    expect(parsed.vst3State).toBeUndefined();
  });
});

describe('VST3 state persistence — projectStore actions', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject({ name: 'Test', bpm: 120 });
    useProjectStore.getState().addTrack('pianoRoll');
  });

  it('updateVST3State updates the vst3State of the correct plugin instance', () => {
    const trackId = useProjectStore.getState().project!.tracks[0].id;
    const vst3Plugin = makeVST3Plugin({ id: 'v1' });
    const wapPlugin = makeWAPPlugin({ id: 'w1' });

    useProjectStore.getState().addPlugin(trackId, vst3Plugin);
    useProjectStore.getState().addPlugin(trackId, wapPlugin);

    useProjectStore.getState().updateVST3State(trackId, 'v1', 'bmV3U3RhdGU=');

    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!;
    const updated = track.plugins!.find((p) => p.id === 'v1')!;
    expect(updated.vst3State).toBe('bmV3U3RhdGU=');

    // Other plugin unchanged
    const other = track.plugins!.find((p) => p.id === 'w1')!;
    expect(other.vst3State).toBeUndefined();
  });

  it('updateVST3State is a no-op when project is null', () => {
    useProjectStore.setState({ project: null });
    // Should not throw
    useProjectStore.getState().updateVST3State('t1', 'i1', 'state');
  });

  it('getAllVST3Instances returns only VST3 plugins across all tracks', () => {
    const state = useProjectStore.getState();
    const trackId1 = state.project!.tracks[0].id;

    // Add a second track
    state.addTrack('stems');
    const trackId2 = useProjectStore.getState().project!.tracks[1].id;

    // Add plugins
    useProjectStore.getState().addPlugin(trackId1, makeVST3Plugin({ id: 'v1', vst3Uid: 'UID-A' }));
    useProjectStore.getState().addPlugin(trackId1, makeWAPPlugin({ id: 'w1' }));
    useProjectStore.getState().addPlugin(trackId2, makeVST3Plugin({ id: 'v2', vst3Uid: 'UID-B' }));

    const instances = useProjectStore.getState().getAllVST3Instances();
    expect(instances).toHaveLength(2);
    expect(instances).toEqual(
      expect.arrayContaining([
        { trackId: trackId1, instanceId: 'v1', vst3Uid: 'UID-A' },
        { trackId: trackId2, instanceId: 'v2', vst3Uid: 'UID-B' },
      ]),
    );
  });

  it('getAllVST3Instances returns empty array when project is null', () => {
    useProjectStore.setState({ project: null });
    expect(useProjectStore.getState().getAllVST3Instances()).toEqual([]);
  });

  it('getAllVST3Instances skips VST3 plugins without vst3Uid', () => {
    const trackId = useProjectStore.getState().project!.tracks[0].id;
    useProjectStore.getState().addPlugin(
      trackId,
      makeVST3Plugin({ id: 'v-no-uid', vst3Uid: undefined }),
    );

    const instances = useProjectStore.getState().getAllVST3Instances();
    expect(instances).toHaveLength(0);
  });
});

describe('VST3 state persistence — backward compatibility', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject({ name: 'Legacy', bpm: 120 });
    useProjectStore.getState().addTrack('pianoRoll');
  });

  it('loading a project without VST3 fields works (tracks with no plugins)', () => {
    const project = useProjectStore.getState().project!;
    // Simulate a legacy project: tracks exist but no plugins array
    const legacyTrack = { ...project.tracks[0] };
    delete (legacyTrack as Record<string, unknown>).plugins;

    useProjectStore.setState({
      project: { ...project, tracks: [legacyTrack] },
    });

    // getAllVST3Instances should handle missing plugins gracefully
    const instances = useProjectStore.getState().getAllVST3Instances();
    expect(instances).toEqual([]);
  });

  it('loading a project with WAP-only plugins works (no VST3 fields)', () => {
    const trackId = useProjectStore.getState().project!.tracks[0].id;
    useProjectStore.getState().addPlugin(trackId, makeWAPPlugin());

    const instances = useProjectStore.getState().getAllVST3Instances();
    expect(instances).toEqual([]);

    // WAP plugin remains intact
    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!;
    expect(track.plugins).toHaveLength(1);
    expect(track.plugins![0].pluginId).toBe('ace-bitcrusher');
  });
});
