import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VST3SidePanel } from '../VST3SidePanel';
import { useUIStore } from '../../../store/uiStore';
import { useVST3Store } from '../../../store/vst3Store';
import { useProjectStore } from '../../../store/projectStore';
import type { VST3ActiveInstance } from '../../../types/vst3';

const INSTANCE_A: VST3ActiveInstance = {
  instanceId: 'inst-a',
  pluginId: 'com.acme.synth',
  pluginName: 'AcmeSynth',
  vendor: 'Acme',
  trackId: 'track-1',
  enabled: true,
  online: true,
  parameters: [
    { id: 0, name: 'Volume', value: 0.8, minValue: 0, maxValue: 1, defaultValue: 0.5, enumValues: [], unit: 'dB' },
    { id: 1, name: 'Pan', value: 0.5, minValue: 0, maxValue: 1, defaultValue: 0.5, enumValues: [], unit: '' },
  ],
  presets: ['Init'],
  activePreset: null,
};

const INSTANCE_B: VST3ActiveInstance = {
  instanceId: 'inst-b',
  pluginId: 'com.acme.reverb',
  pluginName: 'AcmeVerb',
  vendor: 'Acme',
  trackId: 'track-2',
  enabled: false,
  online: true,
  parameters: [],
  presets: [],
  activePreset: null,
};

function setupWithInstances(instances: Record<string, VST3ActiveInstance> = {}) {
  useUIStore.setState({ showVST3Panel: true, selectedTrackIds: new Set() });
  useVST3Store.setState({
    connectionStatus: 'connected',
    plugins: [],
    instances,
  });
  useProjectStore.setState({
    project: {
      id: 'proj-1',
      name: 'Test',
      bpm: 120,
      tracks: [
        { id: 'track-1', displayName: 'Lead Synth', type: 'stems', clips: [], color: '#fff', mute: false, solo: false, volume: 0.8, pan: 0 },
        { id: 'track-2', displayName: 'FX Bus', type: 'stems', clips: [], color: '#0ff', mute: false, solo: false, volume: 0.8, pan: 0 },
      ],
    } as any,
  });
}

describe('Active Plugins section in VST3SidePanel', () => {
  beforeEach(() => {
    setupWithInstances();
  });

  it('shows "Active Plugins" heading', () => {
    setupWithInstances({ 'inst-a': INSTANCE_A });
    render(<VST3SidePanel />);
    expect(screen.getByText('Active Plugins')).toBeInTheDocument();
  });

  it('renders loaded plugin instances', () => {
    setupWithInstances({ 'inst-a': INSTANCE_A, 'inst-b': INSTANCE_B });
    render(<VST3SidePanel />);
    expect(screen.getByText('AcmeSynth')).toBeInTheDocument();
    expect(screen.getByText('AcmeVerb')).toBeInTheDocument();
  });

  it('shows track name for each instance', () => {
    setupWithInstances({ 'inst-a': INSTANCE_A });
    render(<VST3SidePanel />);
    expect(screen.getByText('Lead Synth')).toBeInTheDocument();
  });

  it('shows empty state when no plugins are loaded', () => {
    setupWithInstances({});
    render(<VST3SidePanel />);
    expect(screen.getByTestId('active-plugins-empty')).toBeInTheDocument();
  });

  it('clicking instance expands to show parameters', () => {
    setupWithInstances({ 'inst-a': INSTANCE_A });
    render(<VST3SidePanel />);

    // Click the instance row to expand
    fireEvent.click(screen.getByTestId('active-instance-inst-a'));

    // Should show the plugin panel with parameter sliders
    expect(screen.getByTestId('plugin-panel')).toBeInTheDocument();
    expect(screen.getAllByTestId('param-slider')).toHaveLength(2);
  });

  it('toggle button bypasses/enables instance', () => {
    setupWithInstances({ 'inst-a': INSTANCE_A });
    render(<VST3SidePanel />);

    // Expand first
    fireEvent.click(screen.getByTestId('active-instance-inst-a'));

    fireEvent.click(screen.getByTestId('toggle-enable-btn'));
    expect(useVST3Store.getState().instances['inst-a'].enabled).toBe(false);
  });

  it('remove button removes instance from store', () => {
    setupWithInstances({ 'inst-a': INSTANCE_A });
    render(<VST3SidePanel />);

    // Expand first
    fireEvent.click(screen.getByTestId('active-instance-inst-a'));

    fireEvent.click(screen.getByTestId('remove-plugin-btn'));
    expect(useVST3Store.getState().instances['inst-a']).toBeUndefined();
  });

  it('parameter slider change updates the store after debounce', () => {
    vi.useFakeTimers();
    setupWithInstances({ 'inst-a': INSTANCE_A });
    render(<VST3SidePanel />);

    // Expand
    fireEvent.click(screen.getByTestId('active-instance-inst-a'));

    const sliders = screen.getAllByTestId('param-slider');
    fireEvent.change(sliders[0], { target: { value: '0.9' } });

    // Advance past the 50ms debounce in ParameterControl
    vi.advanceTimersByTime(100);

    expect(useVST3Store.getState().instances['inst-a'].parameters[0].value).toBe(0.9);
    vi.useRealTimers();
  });
});

describe('track grouping in Active Plugins', () => {
  it('groups instances by trackId with track headers', () => {
    const INSTANCE_C: VST3ActiveInstance = {
      instanceId: 'inst-c',
      pluginId: 'com.acme.delay',
      pluginName: 'AcmeDelay',
      vendor: 'Acme',
      trackId: 'track-1',
      enabled: true,
      online: true,
      parameters: [],
      presets: [],
      activePreset: null,
    };
    setupWithInstances({
      'inst-a': INSTANCE_A,
      'inst-b': INSTANCE_B,
      'inst-c': INSTANCE_C,
    });
    render(<VST3SidePanel />);

    // Should have track group containers
    expect(screen.getByTestId('track-group-track-1')).toBeInTheDocument();
    expect(screen.getByTestId('track-group-track-2')).toBeInTheDocument();

    // Track-1 group should contain both AcmeSynth and AcmeDelay
    const group1 = screen.getByTestId('track-group-track-1');
    expect(group1).toHaveTextContent('AcmeSynth');
    expect(group1).toHaveTextContent('AcmeDelay');

    // Track-2 group should contain AcmeVerb
    const group2 = screen.getByTestId('track-group-track-2');
    expect(group2).toHaveTextContent('AcmeVerb');
  });

  it('respects pluginOrder for track ordering', () => {
    const INSTANCE_C: VST3ActiveInstance = {
      instanceId: 'inst-c',
      pluginId: 'com.acme.delay',
      pluginName: 'AcmeDelay',
      vendor: 'Acme',
      trackId: 'track-1',
      enabled: true,
      online: true,
      parameters: [],
      presets: [],
      activePreset: null,
    };
    setupWithInstances({
      'inst-a': INSTANCE_A,
      'inst-c': INSTANCE_C,
    });
    // Set order: delay before synth
    useVST3Store.setState({ pluginOrder: { 'track-1': ['inst-c', 'inst-a'] } });

    render(<VST3SidePanel />);

    const rows = screen.getByTestId('track-group-track-1').querySelectorAll('[data-testid^="plugin-row-"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('data-instance-id', 'inst-c');
    expect(rows[1]).toHaveAttribute('data-instance-id', 'inst-a');
  });

  it('plugin rows are draggable', () => {
    setupWithInstances({ 'inst-a': INSTANCE_A });
    render(<VST3SidePanel />);

    const row = screen.getByTestId('plugin-row-inst-a');
    expect(row).toHaveAttribute('draggable', 'true');
  });
});

describe('setParameter bridge forwarding', () => {
  it('updates store when setParameter is called', () => {
    useVST3Store.setState({
      instances: { 'inst-a': INSTANCE_A },
    });

    useVST3Store.getState().setParameter('inst-a', 0, 0.75);

    expect(useVST3Store.getState().instances['inst-a'].parameters[0].value).toBe(0.75);
  });
});
