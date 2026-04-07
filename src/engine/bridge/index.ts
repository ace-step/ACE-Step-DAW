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
 * @param engine - The AudioEngine singleton (required for web mode,
 *                 ignored when running inside Tauri desktop shell).
 */
export function createBridge(engine: AudioEngine): AudioBridge {
  if (isTauri()) {
    return new TauriBackend();
  }
  return new WebAudioBackend(engine);
}
