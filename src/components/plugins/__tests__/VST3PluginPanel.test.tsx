import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VST3PluginPanel } from '../VST3PluginPanel';
import { useVST3Store } from '../../../store/vst3Store';
import { useProjectStore } from '../../../store/projectStore';
import type { VST3ActiveInstance } from '../../../types/vst3';

const SAMPLE_INSTANCE: VST3ActiveInstance = {
  instanceId: 'inst-1',
  pluginId: 'p1',
  pluginName: 'SuperSynth',
  vendor: 'AcmeCo',
  trackId: 'track-1',
  enabled: true,
  online: true,
  parameters: [
    { id: 0, name: 'Cutoff', value: 0.5, minValue: 0, maxValue: 1, defaultValue: 0.5, enumValues: [], unit: 'Hz' },
    { id: 1, name: 'Resonance', value: 0.3, minValue: 0, maxValue: 1, defaultValue: 0.0, enumValues: [], unit: '' },
    { id: 2, name: 'Wave', value: 1, minValue: 0, maxValue: 3, defaultValue: 0, enumValues: ['Sine', 'Saw', 'Square', 'Tri'], unit: '' },
  ],
  presets: ['Init', 'Warm Pad', 'Bright Lead'],
  activePreset: 'Init',
};

function setupProject() {
  useProjectStore.setState({
    project: {
      id: 'proj-1',
      name: 'Test',
      bpm: 120,
      tracks: [
        { id: 'track-1', displayName: 'Lead Synth', type: 'stems', clips: [], color: '#fff', mute: false, solo: false, volume: 0.8, pan: 0 },
        { id: 'track-2', displayName: 'Drums', type: 'stems', clips: [], color: '#0ff', mute: false, solo: false, volume: 0.8, pan: 0 },
        { id: 'track-3', displayName: 'Bass', type: 'stems', clips: [], color: '#f0f', mute: false, solo: false, volume: 0.8, pan: 0 },
      ],
    } as any,
  });
}

describe('VST3PluginPanel', () => {
  beforeEach(() => {
    useVST3Store.setState({
      instances: { 'inst-1': SAMPLE_INSTANCE },
    });
    setupProject();
  });

  it('renders plugin name and vendor', () => {
    render(<VST3PluginPanel instanceId="inst-1" />);
    expect(screen.getByText('SuperSynth')).toBeInTheDocument();
    expect(screen.getByText('AcmeCo')).toBeInTheDocument();
  });

  it('renders parameter sliders for float params', () => {
    render(<VST3PluginPanel instanceId="inst-1" />);
    const sliders = screen.getAllByTestId('param-slider');
    expect(sliders).toHaveLength(2); // Cutoff + Resonance (Wave is enum)
  });

  it('renders dropdown for enum params', () => {
    render(<VST3PluginPanel instanceId="inst-1" />);
    const enums = screen.getAllByTestId('param-enum');
    expect(enums).toHaveLength(1);
  });

  it('Open Editor button calls openEditor', () => {
    const spy = vi.spyOn(useVST3Store.getState(), 'openEditor');
    render(<VST3PluginPanel instanceId="inst-1" />);
    fireEvent.click(screen.getByTestId('open-editor-btn'));
    expect(spy).toHaveBeenCalledWith('inst-1');
  });

  it('toggle enable button toggles instance', () => {
    render(<VST3PluginPanel instanceId="inst-1" />);
    fireEvent.click(screen.getByTestId('toggle-enable-btn'));
    expect(useVST3Store.getState().instances['inst-1'].enabled).toBe(false);
  });

  it('remove button removes instance', () => {
    render(<VST3PluginPanel instanceId="inst-1" />);
    fireEvent.click(screen.getByTestId('remove-plugin-btn'));
    expect(useVST3Store.getState().instances['inst-1']).toBeUndefined();
  });

  it('preset selector shows available presets', () => {
    render(<VST3PluginPanel instanceId="inst-1" />);
    const select = screen.getByTestId('preset-selector');
    expect(select).toBeInTheDocument();
    // Has 3 presets + the "no preset" option
    expect(select.querySelectorAll('option')).toHaveLength(4);
  });

  it('renders empty state for unknown instance', () => {
    render(<VST3PluginPanel instanceId="nonexistent" />);
    expect(screen.getByTestId('plugin-panel-empty')).toBeInTheDocument();
  });
});

describe('VST3PluginPanel sidechain selector', () => {
  beforeEach(() => {
    setupProject();
  });

  it('does not show sidechain selector when hasSidechainInput is false', () => {
    useVST3Store.setState({
      instances: { 'inst-1': { ...SAMPLE_INSTANCE, hasSidechainInput: false } },
    });
    render(<VST3PluginPanel instanceId="inst-1" />);
    expect(screen.queryByTestId('sidechain-selector')).not.toBeInTheDocument();
  });

  it('does not show sidechain selector when hasSidechainInput is undefined', () => {
    useVST3Store.setState({
      instances: { 'inst-1': SAMPLE_INSTANCE },
    });
    render(<VST3PluginPanel instanceId="inst-1" />);
    expect(screen.queryByTestId('sidechain-selector')).not.toBeInTheDocument();
  });

  it('shows sidechain selector when hasSidechainInput is true', () => {
    useVST3Store.setState({
      instances: { 'inst-1': { ...SAMPLE_INSTANCE, hasSidechainInput: true } },
    });
    render(<VST3PluginPanel instanceId="inst-1" />);
    expect(screen.getByTestId('sidechain-selector')).toBeInTheDocument();
  });

  it('lists all tracks except the current track as sidechain options', () => {
    useVST3Store.setState({
      instances: { 'inst-1': { ...SAMPLE_INSTANCE, hasSidechainInput: true, trackId: 'track-1' } },
    });
    render(<VST3PluginPanel instanceId="inst-1" />);

    const selector = screen.getByTestId('sidechain-selector');
    const options = selector.querySelectorAll('option');
    // "-- None --" + Drums + Bass (not Lead Synth since that's the current track)
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent('-- None --');
    expect(options[1]).toHaveTextContent('Drums');
    expect(options[2]).toHaveTextContent('Bass');
  });

  it('selecting a sidechain source updates the store', () => {
    useVST3Store.setState({
      instances: {
        'inst-1': { ...SAMPLE_INSTANCE, hasSidechainInput: true, sidechainSourceTrackId: null },
      },
    });
    render(<VST3PluginPanel instanceId="inst-1" />);

    fireEvent.change(screen.getByTestId('sidechain-selector'), {
      target: { value: 'track-2' },
    });

    expect(useVST3Store.getState().instances['inst-1'].sidechainSourceTrackId).toBe('track-2');
  });

  it('selecting "None" clears sidechain source', () => {
    useVST3Store.setState({
      instances: {
        'inst-1': {
          ...SAMPLE_INSTANCE,
          hasSidechainInput: true,
          sidechainSourceTrackId: 'track-2',
        },
      },
    });
    render(<VST3PluginPanel instanceId="inst-1" />);

    fireEvent.change(screen.getByTestId('sidechain-selector'), {
      target: { value: '' },
    });

    expect(useVST3Store.getState().instances['inst-1'].sidechainSourceTrackId).toBeNull();
  });
});
