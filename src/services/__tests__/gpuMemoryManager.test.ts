import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtendedModelEntry } from '../../types/api';
import {
  GpuMemoryManager,
  type GpuMemoryState,
} from '../gpuMemoryManager';

describe('GpuMemoryManager', () => {
  let manager: GpuMemoryManager;

  beforeEach(() => {
    manager = new GpuMemoryManager({ totalVramGb: 24 });
  });

  describe('constructor', () => {
    it('initializes with given total VRAM', () => {
      const state = manager.getState();
      expect(state.totalVramGb).toBe(24);
      expect(state.usedVramGb).toBe(0);
      expect(state.loadedModels).toEqual([]);
    });

    it('defaults to 8 GB total VRAM', () => {
      const defaultManager = new GpuMemoryManager();
      expect(defaultManager.getState().totalVramGb).toBe(8);
    });
  });

  describe('loadModel', () => {
    it('tracks a loaded model and updates used VRAM', () => {
      const model: ExtendedModelEntry = {
        name: 'ace-step-v1',
        is_default: true,
        is_loaded: true,
        vram_gb: 6,
      };

      manager.loadModel(model);
      const state = manager.getState();

      expect(state.loadedModels).toHaveLength(1);
      expect(state.loadedModels[0].name).toBe('ace-step-v1');
      expect(state.usedVramGb).toBe(6);
    });

    it('accumulates VRAM from multiple loaded models', () => {
      manager.loadModel({ name: 'model-a', is_default: false, is_loaded: true, vram_gb: 4 });
      manager.loadModel({ name: 'model-b', is_default: false, is_loaded: true, vram_gb: 3 });

      expect(manager.getState().usedVramGb).toBe(7);
      expect(manager.getState().loadedModels).toHaveLength(2);
    });

    it('does not duplicate a model if loaded twice', () => {
      const model: ExtendedModelEntry = { name: 'ace-step-v1', is_default: true, is_loaded: true, vram_gb: 6 };
      manager.loadModel(model);
      manager.loadModel(model);

      expect(manager.getState().loadedModels).toHaveLength(1);
      expect(manager.getState().usedVramGb).toBe(6);
    });
  });

  describe('unloadModel', () => {
    it('removes a model and frees VRAM', () => {
      manager.loadModel({ name: 'model-a', is_default: false, is_loaded: true, vram_gb: 4 });
      manager.loadModel({ name: 'model-b', is_default: false, is_loaded: true, vram_gb: 3 });

      manager.unloadModel('model-a');

      expect(manager.getState().loadedModels).toHaveLength(1);
      expect(manager.getState().usedVramGb).toBe(3);
    });

    it('is a no-op for unknown models', () => {
      manager.loadModel({ name: 'model-a', is_default: false, is_loaded: true, vram_gb: 4 });
      manager.unloadModel('unknown');

      expect(manager.getState().loadedModels).toHaveLength(1);
      expect(manager.getState().usedVramGb).toBe(4);
    });
  });

  describe('canFitModel', () => {
    it('returns true when there is enough VRAM', () => {
      expect(manager.canFitModel(20)).toBe(true);
    });

    it('returns false when model would exceed VRAM', () => {
      manager.loadModel({ name: 'big', is_default: false, is_loaded: true, vram_gb: 20 });
      expect(manager.canFitModel(6)).toBe(false);
    });

    it('considers currently loaded models', () => {
      manager.loadModel({ name: 'model-a', is_default: false, is_loaded: true, vram_gb: 10 });
      manager.loadModel({ name: 'model-b', is_default: false, is_loaded: true, vram_gb: 10 });

      expect(manager.canFitModel(5)).toBe(false);
      expect(manager.canFitModel(4)).toBe(true);
    });
  });

  describe('getAvailableVramGb', () => {
    it('returns total minus used', () => {
      manager.loadModel({ name: 'model-a', is_default: false, is_loaded: true, vram_gb: 7 });
      expect(manager.getAvailableVramGb()).toBe(17);
    });
  });

  describe('getUtilizationPercent', () => {
    it('returns 0 when nothing loaded', () => {
      expect(manager.getUtilizationPercent()).toBe(0);
    });

    it('returns correct percentage', () => {
      manager.loadModel({ name: 'model-a', is_default: false, is_loaded: true, vram_gb: 12 });
      expect(manager.getUtilizationPercent()).toBe(50);
    });
  });

  describe('suggestUnload', () => {
    it('suggests models to unload to fit a new model', () => {
      manager.loadModel({ name: 'model-a', is_default: false, is_loaded: true, vram_gb: 10 });
      manager.loadModel({ name: 'model-b', is_default: false, is_loaded: true, vram_gb: 10 });

      const suggestions = manager.suggestUnload(8);
      // Should suggest unloading enough models to free 8 GB
      expect(suggestions.length).toBeGreaterThan(0);
      const freedVram = suggestions.reduce((sum, m) => sum + (m.vram_gb ?? 0), 0);
      expect(freedVram).toBeGreaterThanOrEqual(4); // need 4 more GB (24 - 20 = 4, need 8)
    });

    it('returns empty when enough space is already available', () => {
      manager.loadModel({ name: 'model-a', is_default: false, is_loaded: true, vram_gb: 5 });
      expect(manager.suggestUnload(10)).toEqual([]);
    });
  });

  describe('syncFromInventory', () => {
    it('updates loaded models from server inventory', () => {
      const inventory: ExtendedModelEntry[] = [
        { name: 'model-a', is_default: true, is_loaded: true, vram_gb: 6 },
        { name: 'model-b', is_default: false, is_loaded: false, vram_gb: 4 },
        { name: 'model-c', is_default: false, is_loaded: true, vram_gb: 3 },
      ];

      manager.syncFromInventory(inventory);
      const state = manager.getState();

      expect(state.loadedModels).toHaveLength(2);
      expect(state.loadedModels.map((m) => m.name)).toEqual(['model-a', 'model-c']);
      expect(state.usedVramGb).toBe(9);
    });
  });
});
