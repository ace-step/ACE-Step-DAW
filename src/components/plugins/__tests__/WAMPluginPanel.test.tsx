import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WAMPluginPanel } from '../WAMPluginPanel';
import { useWAMStore } from '../../../store/wamStore';
import type { WAMActiveInstance } from '../../../types/wam';

const mockInstance: WAMActiveInstance = {
  instanceId: 'test-inst-1',
  pluginId: 'wam-test',
  pluginName: 'Test WAM Plugin',
  vendor: 'Test Vendor',
  trackId: 'track-1',
  enabled: true,
  parameters: [
    {
      id: 'gain',
      label: 'Gain',
      type: 'float',
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      discreteStep: 0,
      exponent: 1,
    },
    {
      id: 'mode',
      label: 'Mode',
      type: 'choice',
      defaultValue: 0,
      minValue: 0,
      maxValue: 2,
      discreteStep: 1,
      exponent: 1,
      choices: ['Clean', 'Warm', 'Hot'],
    },
    {
      id: 'active',
      label: 'Active',
      type: 'boolean',
      defaultValue: 1,
      minValue: 0,
      maxValue: 1,
      discreteStep: 1,
      exponent: 1,
    },
  ],
  parameterValues: { gain: 0.5, mode: 0, active: 1 },
  activePreset: null,
  presets: ['Default', 'Lead'],
  hasGui: true,
  guiVisible: false,
  descriptor: null,
};

describe('WAMPluginPanel', () => {
  beforeEach(() => {
    useWAMStore.setState({
      hostStatus: 'ready',
      instances: { 'test-inst-1': mockInstance },
      pluginOrder: {},
      presets: {},
      _adapters: new Map(),
    });
  });

  it('should render the plugin panel', () => {
    render(<WAMPluginPanel instanceId="test-inst-1" />);
    expect(screen.getByTestId('wam-plugin-panel')).toBeInTheDocument();
    expect(screen.getByText('Test WAM Plugin')).toBeInTheDocument();
    expect(screen.getByText('Test Vendor')).toBeInTheDocument();
  });

  it('should show empty state for non-existent instance', () => {
    render(<WAMPluginPanel instanceId="nonexistent" />);
    expect(screen.getByTestId('wam-panel-empty')).toBeInTheDocument();
  });

  it('should render parameter controls', () => {
    render(<WAMPluginPanel instanceId="test-inst-1" />);
    expect(screen.getByTestId('wam-param-list')).toBeInTheDocument();
    // Float slider
    expect(screen.getByTestId('wam-param-slider')).toBeInTheDocument();
    // Choice dropdown
    expect(screen.getByTestId('wam-param-enum')).toBeInTheDocument();
    // Boolean toggle
    expect(screen.getByTestId('wam-param-bool')).toBeInTheDocument();
  });

  it('should render preset selector with presets', () => {
    render(<WAMPluginPanel instanceId="test-inst-1" />);
    const selector = screen.getByTestId('wam-preset-selector');
    expect(selector).toBeInTheDocument();
    // Should have "-- No preset --" + 2 presets
    const options = selector.querySelectorAll('option');
    expect(options.length).toBe(3);
  });

  it('should show GUI toggle button when plugin has GUI', () => {
    render(<WAMPluginPanel instanceId="test-inst-1" />);
    expect(screen.getByTestId('wam-toggle-gui-btn')).toBeInTheDocument();
  });

  it('should hide GUI toggle when plugin has no GUI', () => {
    useWAMStore.setState({
      instances: {
        'test-inst-1': { ...mockInstance, hasGui: false },
      },
    });
    render(<WAMPluginPanel instanceId="test-inst-1" />);
    expect(screen.queryByTestId('wam-toggle-gui-btn')).not.toBeInTheDocument();
  });

  it('should show reduced opacity when bypassed', () => {
    useWAMStore.setState({
      instances: {
        'test-inst-1': { ...mockInstance, enabled: false },
      },
    });
    render(<WAMPluginPanel instanceId="test-inst-1" />);
    const panel = screen.getByTestId('wam-plugin-panel');
    expect(panel.className).toContain('opacity-40');
  });

  it('should call toggleInstance on bypass button click', () => {
    const toggleSpy = vi.fn();
    useWAMStore.setState({ toggleInstance: toggleSpy } as any);

    render(<WAMPluginPanel instanceId="test-inst-1" />);
    fireEvent.click(screen.getByTestId('wam-toggle-enable-btn'));
    expect(toggleSpy).toHaveBeenCalledWith('test-inst-1');
  });

  it('should call removeInstance on remove button click', () => {
    const removeSpy = vi.fn();
    useWAMStore.setState({ removeInstance: removeSpy } as any);

    render(<WAMPluginPanel instanceId="test-inst-1" />);
    fireEvent.click(screen.getByTestId('wam-remove-btn'));
    expect(removeSpy).toHaveBeenCalledWith('test-inst-1');
  });
});
