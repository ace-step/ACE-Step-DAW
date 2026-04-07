import { describe, it, expect, afterEach } from 'vitest';
import { createBridge } from '../index';
import { WebAudioBackend } from '../WebAudioBackend';
import type { AudioEngine } from '../../AudioEngine';

const fakeEngine = {} as AudioEngine;

describe('createBridge', () => {
  afterEach(() => {
    delete (window as Record<string, unknown>).__TAURI__;
    delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it('returns WebAudioBackend when not in Tauri', () => {
    const bridge = createBridge(fakeEngine);
    expect(bridge).toBeInstanceOf(WebAudioBackend);
    expect(bridge.backend).toBe('web-audio');
  });

  it('returns WebAudioBackend even inside Tauri shell (Phase 1 — Rust engine not ready)', () => {
    (window as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const bridge = createBridge(fakeEngine);
    // During Phase 1, always use WebAudioBackend until Rust engine is ready
    expect(bridge).toBeInstanceOf(WebAudioBackend);
    expect(bridge.backend).toBe('web-audio');
  });
});
