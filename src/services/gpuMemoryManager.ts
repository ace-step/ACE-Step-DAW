/**
 * GPU Memory Manager (#741)
 *
 * Tracks estimated VRAM usage across loaded AI models.
 * Prevents OOM by checking available memory before loading new models
 * and suggesting which models to unload when space is needed.
 */
import type { ExtendedModelEntry } from '../types/api';

const DEFAULT_TOTAL_VRAM_GB = 8;
const DEFAULT_MODEL_VRAM_GB = 4;

export interface GpuMemoryState {
  totalVramGb: number;
  usedVramGb: number;
  loadedModels: ExtendedModelEntry[];
}

export class GpuMemoryManager {
  private totalVramGb: number;
  private loadedModels: Map<string, ExtendedModelEntry> = new Map();

  constructor(opts?: { totalVramGb?: number }) {
    this.totalVramGb = opts?.totalVramGb ?? DEFAULT_TOTAL_VRAM_GB;
  }

  getState(): GpuMemoryState {
    const models = Array.from(this.loadedModels.values());
    return {
      totalVramGb: this.totalVramGb,
      usedVramGb: models.reduce((sum, m) => sum + (m.vram_gb ?? DEFAULT_MODEL_VRAM_GB), 0),
      loadedModels: models,
    };
  }

  loadModel(model: ExtendedModelEntry): void {
    if (this.loadedModels.has(model.name)) return;
    this.loadedModels.set(model.name, model);
  }

  unloadModel(name: string): void {
    this.loadedModels.delete(name);
  }

  canFitModel(requiredVramGb: number): boolean {
    return this.getAvailableVramGb() >= requiredVramGb;
  }

  getAvailableVramGb(): number {
    return this.totalVramGb - this.getState().usedVramGb;
  }

  getUtilizationPercent(): number {
    const { usedVramGb, totalVramGb } = this.getState();
    if (totalVramGb === 0) return 0;
    return Math.round((usedVramGb / totalVramGb) * 100);
  }

  /**
   * Suggest models to unload to free enough VRAM for a new model.
   * Returns models sorted by non-default first (prefer unloading non-defaults).
   */
  suggestUnload(requiredVramGb: number): ExtendedModelEntry[] {
    const available = this.getAvailableVramGb();
    if (available >= requiredVramGb) return [];

    const needed = requiredVramGb - available;
    const candidates = Array.from(this.loadedModels.values())
      // Prefer unloading non-default models first
      .sort((a, b) => (a.is_default === b.is_default ? 0 : a.is_default ? 1 : -1));

    const toUnload: ExtendedModelEntry[] = [];
    let freed = 0;
    for (const model of candidates) {
      if (freed >= needed) break;
      toUnload.push(model);
      freed += model.vram_gb ?? DEFAULT_MODEL_VRAM_GB;
    }
    return toUnload;
  }

  /**
   * Sync internal state from the server's model inventory.
   * Only tracks models that are currently loaded (`is_loaded: true`).
   */
  syncFromInventory(inventory: ExtendedModelEntry[]): void {
    this.loadedModels.clear();
    for (const model of inventory) {
      if (model.is_loaded) {
        this.loadedModels.set(model.name, model);
      }
    }
  }

  setTotalVram(gb: number): void {
    this.totalVramGb = gb;
  }
}
