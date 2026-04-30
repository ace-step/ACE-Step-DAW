import { describe, it, expect, afterEach, vi } from 'vitest';
import { _resetAudioBridgeForTests, createBridge, getAudioBridge } from '../index';
import { WebAudioBackend } from '../WebAudioBackend';
import { TauriBackend } from '../TauriBackend';
import type { AudioEngine } from '../../AudioEngine';

const fakeEngine = {} as AudioEngine;

describe('createBridge', () => {
  afterEach(() => {
    delete (window as Record<string, unknown>).__TAURI__;
    delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
    vi.unstubAllEnvs();
    _resetAudioBridgeForTests();
  });

  it('returns WebAudioBackend when not in Tauri', () => {
    const bridge = createBridge(fakeEngine);
    expect(bridge).toBeInstanceOf(WebAudioBackend);
    expect(bridge.backend).toBe('web-audio');
  });

  it('returns WebAudioBackend inside Tauri shell when native audio gate is off', () => {
    (window as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const bridge = createBridge(fakeEngine);
    expect(bridge).toBeInstanceOf(WebAudioBackend);
    expect(bridge.backend).toBe('web-audio');
  });

  it('returns WebAudioBackend when native audio gate is on outside Tauri', () => {
    vi.stubEnv('VITE_ENABLE_TAURI_AUDIO_BACKEND', 'true');

    const bridge = createBridge(fakeEngine);

    expect(bridge).toBeInstanceOf(WebAudioBackend);
    expect(bridge.backend).toBe('web-audio');
  });

  it('returns TauriBackend inside Tauri shell when native audio gate is on', () => {
    (window as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    vi.stubEnv('VITE_ENABLE_TAURI_AUDIO_BACKEND', 'true');

    const bridge = createBridge(fakeEngine);

    expect(bridge).toBeInstanceOf(TauriBackend);
    expect(bridge.backend).toBe('tauri');
  });

  it('reuses the audio bridge singleton', () => {
    const first = getAudioBridge(fakeEngine);
    const second = getAudioBridge(fakeEngine);

    expect(second).toBe(first);
  });
});
