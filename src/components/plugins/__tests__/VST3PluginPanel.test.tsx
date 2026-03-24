import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VST3PluginPanel } from '../VST3PluginPanel';
import { useVST3Store } from '../../../store/vst3Store';
import type { VST3ActiveInstance } from '../../../types/vst3';

const SAMPLE_INSTANCE: VST3ActiveInstance = {
  instanceId: 'inst-1',
  pluginId: 'p1',
  pluginName: 'SuperSynth',
  vendor: 'AcmeCo',
  trackId: 'track-1',
  enabled: true,
  parameters: [
    { id: 0, name: 'Cutoff', value: 0.5, minValue: 0, maxValue: 1, defaultValue: 0.5, enumValues: [], unit: 'Hz' },
    { id: 1, name: 'Resonance', value: 0.3, minValue: 0, maxValue: 1, defaultValue: 0.0, enumValues: [], unit: '' },
    { id: 2, name: 'Wave', value: 1, minValue: 0, maxValue: 3, defaultValue: 0, enumValues: ['Sine', 'Saw', 'Square', 'Tri'], unit: '' },
  ],
  presets: ['Init', 'Warm Pad', 'Bright Lead'],
  activePreset: 'Init',
};

describe('VST3PluginPanel', () => {
  beforeEach(() => {
    useVST3Store.setState({
      instances: { 'inst-1': SAMPLE_INSTANCE },
    });
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
