import { describe, it, expect, afterEach } from 'vitest';
import { createBridge } from '../index';
import { WebAudioBackend } from '../WebAudioBackend';
import { TauriBackend } from '../TauriBackend';
import type { AudioEngine } from '../../AudioEngine';

const fakeEngine = {} as AudioEngine;

describe('createBridge', () => {
  afterEach(() => {
    delete (window as Record<string, unknown>).__TAURI__;
  });

  it('returns WebAudioBackend when not in Tauri', () => {
    const bridge = createBridge(fakeEngine);
    expect(bridge).toBeInstanceOf(WebAudioBackend);
    expect(bridge.backend).toBe('web-audio');
  });

  it('returns TauriBackend when __TAURI__ is present', () => {
    (window as Record<string, unknown>).__TAURI__ = {};
    const bridge = createBridge(fakeEngine);
    expect(bridge).toBeInstanceOf(TauriBackend);
    expect(bridge.backend).toBe('tauri');
  });
});
