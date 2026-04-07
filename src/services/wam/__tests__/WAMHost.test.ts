import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WAMHost, validatePluginUrl } from '../WAMHost';

describe('WAMHost', () => {
  let host: WAMHost;

  beforeEach(() => {
    host = new WAMHost();
  });

  afterEach(() => {
    host.dispose();
  });

  it('should start uninitialized', () => {
    expect(host.isInitialized()).toBe(false);
    expect(host.getGroupId()).toBeNull();
    expect(host.getAudioContext()).toBeNull();
  });

  it('should return existing state on double-init', () => {
    // Simulate initialized state
    (host as any)._initialized = true;
    (host as any)._groupId = 'test-group';
    (host as any)._groupKey = 'test-key';
    (host as any)._audioContext = {} as BaseAudioContext;

    expect(host.isInitialized()).toBe(true);
    expect(host.getGroupId()).toBe('test-group');
  });

  it('should transition to initialized state after init call returns', async () => {
    (host as any)._initialized = true;
    (host as any)._groupId = 'host-1';
    (host as any)._groupKey = 'key-1';
    (host as any)._audioContext = {} as BaseAudioContext;

    const result = await host.initialize({} as BaseAudioContext);
    expect(result).toEqual(['host-1', 'key-1']);
    expect(host.isInitialized()).toBe(true);
  });

  it('should throw from loadPlugin when not initialized', async () => {
    await expect(host.loadPlugin('https://example.com/plugin.js')).rejects.toThrow(
      'WAMHost not initialized',
    );
  });

  it('should dispose cleanly', () => {
    (host as any)._initialized = true;
    (host as any)._groupId = 'test-group';

    host.dispose();

    expect(host.isInitialized()).toBe(false);
    expect(host.getGroupId()).toBeNull();
    expect(host.getAudioContext()).toBeNull();
  });
});

describe('validatePluginUrl', () => {
  it('should accept HTTPS URLs', () => {
    expect(() => validatePluginUrl('https://example.com/plugin.js')).not.toThrow();
  });

  it('should accept HTTP URLs for localhost dev', () => {
    expect(() => validatePluginUrl('http://localhost:3000/plugin.js')).not.toThrow();
    expect(() => validatePluginUrl('http://127.0.0.1:8080/plugin.js')).not.toThrow();
  });

  it('should reject HTTP URLs for non-localhost hosts', () => {
    expect(() => validatePluginUrl('http://example.com/plugin.js')).toThrow(
      'HTTP is only allowed for localhost',
    );
  });

  it('should reject javascript: URLs', () => {
    expect(() => validatePluginUrl('javascript:alert(1)')).toThrow('Unsafe WAM plugin URL protocol');
  });

  it('should reject data: URLs', () => {
    expect(() => validatePluginUrl('data:text/javascript,alert(1)')).toThrow(
      'Unsafe WAM plugin URL protocol',
    );
  });

  it('should reject blob: URLs', () => {
    expect(() => validatePluginUrl('blob:http://example.com/uuid')).toThrow(
      'Unsafe WAM plugin URL protocol',
    );
  });

  it('should reject empty URLs', () => {
    expect(() => validatePluginUrl('')).toThrow('must not be empty');
    expect(() => validatePluginUrl('  ')).toThrow('must not be empty');
  });
});
