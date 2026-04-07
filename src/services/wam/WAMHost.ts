/**
 * WAMHost — Manages WAM 2.0 host environment initialization.
 *
 * Initializes the WamEnv and WamGroup on the AudioWorklet thread,
 * providing the host group ID needed for all WAM plugin instances.
 */

export class WAMHost {
  private _initialized = false;
  private _groupId: string | null = null;
  private _groupKey: string | null = null;
  private _audioContext: BaseAudioContext | null = null;

  /** Whether the WAM host environment has been initialized. */
  isInitialized(): boolean {
    return this._initialized;
  }

  /** The host group ID, or null if not initialized. */
  getGroupId(): string | null {
    return this._groupId;
  }

  /** The AudioContext used for this host. */
  getAudioContext(): BaseAudioContext | null {
    return this._audioContext;
  }

  /**
   * Initialize the WAM host environment on the given AudioContext.
   * Must be called once before loading any WAM plugins.
   * Returns the [hostGroupId, hostGroupKey] tuple.
   */
  async initialize(audioContext: BaseAudioContext): Promise<[string, string]> {
    if (this._initialized) {
      return [this._groupId!, this._groupKey!];
    }

    const { default: initializeWamHost } = await import(
      /* @vite-ignore */ '@webaudiomodules/sdk/src/initializeWamHost.js'
    );

    const [groupId, groupKey] = await initializeWamHost(
      audioContext,
      'ace-step-daw',
    );

    this._initialized = true;
    this._groupId = groupId;
    this._groupKey = groupKey;
    this._audioContext = audioContext;

    return [groupId, groupKey];
  }

  /**
   * Load a WAM plugin from a URL.
   * The URL should point to an ES module with a default export extending WebAudioModule.
   */
  async loadPlugin(
    pluginUrl: string,
    initialState?: unknown,
  ): Promise<WAMPluginHandle> {
    if (!this._initialized || !this._groupId || !this._audioContext) {
      throw new Error('WAMHost not initialized. Call initialize() first.');
    }

    const { default: WAMConstructor } = await import(
      /* @vite-ignore */ pluginUrl
    );

    const instance = await WAMConstructor.createInstance(
      this._groupId,
      this._audioContext,
      initialState,
    );

    return {
      instance,
      audioNode: instance.audioNode,
      moduleId: instance.moduleId,
      instanceId: instance.instanceId,
      descriptor: instance.descriptor,
    };
  }

  /** Clean up the host environment. */
  dispose(): void {
    this._initialized = false;
    this._groupId = null;
    this._groupKey = null;
    this._audioContext = null;
  }
}

/** Handle returned after loading a WAM plugin. */
export interface WAMPluginHandle {
  /** The WAM instance (WebAudioModule) */
  instance: any; // WebAudioModule type from SDK
  /** The audio node to connect to the audio graph */
  audioNode: AudioNode;
  /** The WAM module identifier */
  moduleId: string;
  /** The WAM instance identifier */
  instanceId: string;
  /** Plugin descriptor metadata */
  descriptor: any; // WamDescriptor from SDK
}

/** Singleton WAM host instance. */
export const wamHost = new WAMHost();
