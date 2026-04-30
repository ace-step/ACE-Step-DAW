/**
 * AudioBridge factory — runtime detection of browser vs desktop.
 *
 * Usage:
 *   import { createBridge } from './engine/bridge';
 *   const bridge = createBridge(audioEngine);
 *
 * During migration the UI can use bridge methods alongside direct
 * AudioEngine calls. Once all stores are migrated, AudioEngine
 * becomes an internal implementation detail of WebAudioBackend.
 */

export type { AudioBridge, TrackParams, BridgeClipInfo, MeterData, MasterMeterData } from './types';
export { WebAudioBackend } from './WebAudioBackend';
export { TauriBackend } from './TauriBackend';

import type { AudioBridge } from './types';
import type { AudioEngine } from '../AudioEngine';
import { WebAudioBackend } from './WebAudioBackend';
import { TauriBackend } from './TauriBackend';
import { isTauriAudioBackendEnabled } from '../../utils/tauri';

/**
 * Create the appropriate AudioBridge for the current runtime.
 *
 * The native Rust backend is opt-in while migration continues. Browser
 * builds and Tauri shells without the gate keep the WebAudio backend.
 *
 * @param engine - The AudioEngine singleton used by WebAudioBackend.
 */
export function createBridge(engine: AudioEngine): AudioBridge {
  if (isTauriAudioBackendEnabled()) return new TauriBackend();
  return new WebAudioBackend(engine);
}

let bridgeInstance: AudioBridge | null = null;

export function getAudioBridge(engine: AudioEngine): AudioBridge {
  if (!bridgeInstance) {
    bridgeInstance = createBridge(engine);
  }
  return bridgeInstance;
}

/** @internal Reset singleton for tests. */
export function _resetAudioBridgeForTests(): void {
  bridgeInstance = null;
}
