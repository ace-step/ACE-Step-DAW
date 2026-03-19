import { describe, expect, it } from 'vitest';

/**
 * Tests for the typed DAW action API (issue #385).
 *
 * These tests verify that:
 * 1. A single exported TypeScript action interface exists
 * 2. Core store actions align with the typed contract
 * 3. window.__store can be typed against the public API
 * 4. Action types are re-exported from a stable module boundary
 */

describe('Typed DAW Action API', () => {
  it('exports DAWActions interface from types/dawActions', async () => {
    const mod = await import('../../src/types/dawActions');
    // The module should export the type (we verify the module exists and is importable)
    expect(mod).toBeDefined();
  });

  it('exports ProjectActions type that matches projectStore action methods', async () => {
    const { useProjectStore } = await import('../../src/store/projectStore');
    const state = useProjectStore.getState();

    // Verify key action methods exist with correct types
    expect(typeof state.addTrack).toBe('function');
    expect(typeof state.removeTrack).toBe('function');
    expect(typeof state.addClip).toBe('function');
    expect(typeof state.updateClip).toBe('function');
    expect(typeof state.addMidiNote).toBe('function');
    expect(typeof state.toggleSequencerStep).toBe('function');
    expect(typeof state.undo).toBe('function');
    expect(typeof state.redo).toBe('function');
    expect(typeof state.addTrackEffect).toBe('function');
    expect(typeof state.addReturnTrack).toBe('function');
    expect(typeof state.addMarker).toBe('function');
    expect(typeof state.addTempoEvent).toBe('function');
  });

  it('exports TransportActions type that matches transportStore action methods', async () => {
    const { useTransportStore } = await import('../../src/store/transportStore');
    const state = useTransportStore.getState();

    expect(typeof state.play).toBe('function');
    expect(typeof state.pause).toBe('function');
    expect(typeof state.stop).toBe('function');
    expect(typeof state.seek).toBe('function');
    expect(typeof state.toggleLoop).toBe('function');
    expect(typeof state.toggleMetronome).toBe('function');
    expect(typeof state.armTrack).toBe('function');
  });

  it('exports UIActions type that matches uiStore action methods', async () => {
    const { useUIStore } = await import('../../src/store/uiStore');
    const state = useUIStore.getState();

    expect(typeof state.selectClip).toBe('function');
    expect(typeof state.deselectAll).toBe('function');
    expect(typeof state.zoomIn).toBe('function');
    expect(typeof state.zoomOut).toBe('function');
    expect(typeof state.toggleMainView).toBe('function');
  });

  it('exports DAWGlobals interface for window type declarations', async () => {
    const mod = await import('../../src/types/dawActions');
    // Module should be importable and provide type-level constructs
    // At runtime we verify the module shape
    expect(mod).toBeDefined();
  });

  it('re-exports action types from the stable api barrel', async () => {
    const mod = await import('../../src/api/dawApi');
    expect(mod).toBeDefined();
    // The barrel should re-export the types (verified at compile time)
    // At runtime we verify the module is importable
  });

  it('provides getDAWApi() accessor that returns typed store references', async () => {
    const { getDAWApi } = await import('../../src/api/dawApi');
    expect(typeof getDAWApi).toBe('function');

    const api = getDAWApi();
    expect(api).toBeDefined();
    expect(api.project).toBeDefined();
    expect(api.transport).toBeDefined();
    expect(api.ui).toBeDefined();
    expect(api.generation).toBeDefined();
    expect(api.collaboration).toBeDefined();
    expect(api.session).toBeDefined();
    expect(api.shortcuts).toBeDefined();
  });

  it('getDAWApi().project exposes store actions', async () => {
    const { getDAWApi } = await import('../../src/api/dawApi');
    const api = getDAWApi();

    // Verify project actions are callable
    expect(typeof api.project.getState).toBe('function');
    const state = api.project.getState();
    expect(typeof state.addTrack).toBe('function');
    expect(typeof state.removeTrack).toBe('function');
  });

  it('getDAWApi().transport exposes store actions', async () => {
    const { getDAWApi } = await import('../../src/api/dawApi');
    const api = getDAWApi();

    expect(typeof api.transport.getState).toBe('function');
    const state = api.transport.getState();
    expect(typeof state.play).toBe('function');
    expect(typeof state.stop).toBe('function');
  });
});
