import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useVST3Store } from '../vst3Store';

describe('vst3Store favorites', () => {
  beforeEach(() => {
    localStorage.clear();
    useVST3Store.setState({ favoritePluginIds: new Set() });
  });

  it('starts with empty favorites', () => {
    expect(useVST3Store.getState().favoritePluginIds.size).toBe(0);
  });

  it('toggleFavorite adds a plugin to favorites', () => {
    useVST3Store.getState().toggleFavorite('plugin-1');
    expect(useVST3Store.getState().favoritePluginIds.has('plugin-1')).toBe(true);
  });

  it('toggleFavorite removes a plugin from favorites when toggled again', () => {
    useVST3Store.getState().toggleFavorite('plugin-1');
    useVST3Store.getState().toggleFavorite('plugin-1');
    expect(useVST3Store.getState().favoritePluginIds.has('plugin-1')).toBe(false);
  });

  it('isFavorite returns correct status', () => {
    useVST3Store.getState().toggleFavorite('plugin-1');
    expect(useVST3Store.getState().isFavorite('plugin-1')).toBe(true);
    expect(useVST3Store.getState().isFavorite('plugin-2')).toBe(false);
  });

  it('persists favorites to localStorage', () => {
    useVST3Store.getState().toggleFavorite('plugin-1');
    useVST3Store.getState().toggleFavorite('plugin-2');
    const stored = JSON.parse(localStorage.getItem('vst3-favorites') || '[]');
    expect(stored).toContain('plugin-1');
    expect(stored).toContain('plugin-2');
  });

  it('supports multiple favorites simultaneously', () => {
    useVST3Store.getState().toggleFavorite('plugin-1');
    useVST3Store.getState().toggleFavorite('plugin-2');
    useVST3Store.getState().toggleFavorite('plugin-3');
    expect(useVST3Store.getState().favoritePluginIds.size).toBe(3);
  });
});

describe('vst3Store companion app status', () => {
  beforeEach(() => {
    useVST3Store.setState({
      connectionStatus: 'disconnected',
      companionVersion: null,
      companionAppStatus: 'unknown',
    });
  });

  it('sets status to running when connected with acceptable version', () => {
    useVST3Store.getState().setCompanionVersion('1.2.0');
    useVST3Store.getState().setConnectionStatus('connected');
    expect(useVST3Store.getState().companionAppStatus).toBe('running');
  });

  it('sets status to outdated when connected with old version', () => {
    useVST3Store.getState().setCompanionVersion('0.9.0');
    useVST3Store.getState().setConnectionStatus('connected');
    expect(useVST3Store.getState().companionAppStatus).toBe('outdated');
  });

  it('sets status to not-installed on first connection error', () => {
    // Simulate: disconnected -> connecting -> error (never connected before)
    useVST3Store.setState({ connectionStatus: 'connecting', companionAppStatus: 'unknown' });
    useVST3Store.getState().setConnectionStatus('error');
    expect(useVST3Store.getState().companionAppStatus).toBe('not-installed');
  });

  it('sets status to not-running when previously connected then disconnects', () => {
    // First connect
    useVST3Store.setState({ connectionStatus: 'connected', companionAppStatus: 'running' });
    // Then disconnect
    useVST3Store.getState().setConnectionStatus('disconnected');
    expect(useVST3Store.getState().companionAppStatus).toBe('not-running');
  });
});

describe('vst3Store setup wizard', () => {
  beforeEach(() => {
    localStorage.clear();
    useVST3Store.setState({ setupWizardDismissed: false });
  });

  it('starts with wizard not dismissed', () => {
    expect(useVST3Store.getState().setupWizardDismissed).toBe(false);
  });

  it('dismissSetupWizard sets flag and persists', () => {
    useVST3Store.getState().dismissSetupWizard();
    expect(useVST3Store.getState().setupWizardDismissed).toBe(true);
    expect(localStorage.getItem('vst3-setup-dismissed')).toBe('true');
  });
});
