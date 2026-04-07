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
import { isTauri } from '../../utils/tauri';

/**
 * Create the appropriate AudioBridge for the current runtime.
 *
 * During Phase 1 migration, always use the WebAudio-backed bridge,
 * including inside the Tauri shell, until the Rust/Tauri backend
 * fully implements the required AudioBridge lifecycle methods.
 *
 * @param engine - The AudioEngine singleton used by WebAudioBackend.
 */
export function createBridge(engine: AudioEngine): AudioBridge {
  // TODO: Switch to TauriBackend when Rust engine is ready (Phase 3+)
  // if (isTauri()) return new TauriBackend();
  return new WebAudioBackend(engine);
}
