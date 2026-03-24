import { get, set } from 'idb-keyval';
import { v4 as uuidv4 } from 'uuid';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface VST3Preset {
  id: string;
  name: string;
  pluginUid: string;
  isFactory: boolean;
  stateData?: string;
  createdAt?: number;
  updatedAt?: number;
}

/** Minimal bridge surface consumed by the preset manager. */
export interface BridgeClientLike {
  getState(instanceId: string): Promise<string>;
  setState(instanceId: string, data: string): Promise<void>;
  request<T>(msg: object): Promise<T>;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function idbKey(pluginUid: string): string {
  return `vst3-presets-${pluginUid}`;
}

function uuid(): string {
  return uuidv4();
}

/* ------------------------------------------------------------------ */
/*  Manager                                                            */
/* ------------------------------------------------------------------ */

export class VST3PresetManager {
  /** In-memory cache keyed by pluginUid. */
  private cache = new Map<string, VST3Preset[]>();

  constructor(private bridge: BridgeClientLike) {}

  /* ---------- factory presets ---------- */

  async getFactoryPresets(instanceId: string): Promise<VST3Preset[]> {
    const res = await this.bridge.request<{
      presets: { id: number; name: string }[];
    }>({ type: 'get_factory_presets', instanceId });

    return res.presets.map((p) => ({
      id: String(p.id),
      name: p.name,
      pluginUid: '',
      isFactory: true,
    }));
  }

  async loadFactoryPreset(instanceId: string, presetId: number): Promise<void> {
    await this.bridge.request({ type: 'load_preset', instanceId, presetId });
  }

  /* ---------- user presets ---------- */

  async saveUserPreset(
    instanceId: string,
    pluginUid: string,
    name: string,
  ): Promise<VST3Preset> {
    const stateData = await this.bridge.getState(instanceId);
    const now = Date.now();
    const preset: VST3Preset = {
      id: uuid(),
      name,
      pluginUid,
      isFactory: false,
      stateData,
      createdAt: now,
      updatedAt: now,
    };

    const list = this.getPresetsForPlugin(pluginUid);
    list.push(preset);
    this.cache.set(pluginUid, list);
    await this.persist(pluginUid);
    return preset;
  }

  async loadUserPreset(instanceId: string, preset: VST3Preset): Promise<void> {
    if (!preset.stateData) return;
    await this.bridge.setState(instanceId, preset.stateData);
  }

  getUserPresets(pluginUid: string): VST3Preset[] {
    return this.getPresetsForPlugin(pluginUid);
  }

  deleteUserPreset(presetId: string): void {
    for (const [uid, list] of this.cache.entries()) {
      const idx = list.findIndex((p) => p.id === presetId);
      if (idx !== -1) {
        list.splice(idx, 1);
        this.persist(uid);
        return;
      }
    }
  }

  renameUserPreset(presetId: string, newName: string): void {
    for (const [uid, list] of this.cache.entries()) {
      const preset = list.find((p) => p.id === presetId);
      if (preset) {
        preset.name = newName;
        preset.updatedAt = Date.now();
        this.persist(uid);
        return;
      }
    }
  }

  /* ---------- import / export ---------- */

  async exportPreset(instanceId: string): Promise<{ name: string; data: string }> {
    const [data, info] = await Promise.all([
      this.bridge.getState(instanceId),
      this.bridge.request<{ name: string }>({ type: 'get_preset_info', instanceId }),
    ]);
    return { name: info.name, data };
  }

  async importPreset(instanceId: string, data: string): Promise<void> {
    await this.bridge.setState(instanceId, data);
  }

  /* ---------- internal ---------- */

  private getPresetsForPlugin(pluginUid: string): VST3Preset[] {
    if (!this.cache.has(pluginUid)) {
      this.cache.set(pluginUid, []);
    }
    return this.cache.get(pluginUid)!;
  }

  private async persist(pluginUid: string): Promise<void> {
    const list = this.cache.get(pluginUid) ?? [];
    await set(idbKey(pluginUid), list);
  }

  /** Hydrate in-memory cache from IndexedDB. Call once on startup. */
  async loadFromStorage(pluginUid: string): Promise<void> {
    const stored = await get<VST3Preset[]>(idbKey(pluginUid));
    if (stored) {
      this.cache.set(pluginUid, stored);
    }
  }
}
