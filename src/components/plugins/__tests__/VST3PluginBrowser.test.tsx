import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VST3PluginBrowser } from '../VST3PluginBrowser';
import { useVST3Store } from '../../../store/vst3Store';
import type { VST3PluginInfo } from '../../../types/vst3';

const SAMPLE_PLUGINS: VST3PluginInfo[] = [
  { id: 'p1', name: 'SuperSynth', vendor: 'AcmeCo', version: '1.0', subcategory: 'Synth', category: 'instrument' },
  { id: 'p2', name: 'MegaReverb', vendor: 'AcmeCo', version: '2.0', subcategory: 'Reverb', category: 'effect' },
  { id: 'p3', name: 'BassLine', vendor: 'BetaSoft', version: '1.1', subcategory: 'Synth', category: 'instrument' },
  { id: 'p4', name: 'EQMaster', vendor: 'BetaSoft', version: '3.0', subcategory: 'EQ', category: 'effect' },
];

describe('VST3PluginBrowser', () => {
  beforeEach(() => {
    useVST3Store.setState({
      connectionStatus: 'connected',
      plugins: SAMPLE_PLUGINS,
      scanning: false,
      scanProgress: null,
    });
  });

  it('shows plugins from store', () => {
    render(<VST3PluginBrowser />);
    const rows = screen.getAllByTestId('plugin-row');
    expect(rows).toHaveLength(4);
    expect(screen.getByText('SuperSynth')).toBeInTheDocument();
    expect(screen.getByText('MegaReverb')).toBeInTheDocument();
  });

  it('shows disconnected state when companion is not connected', () => {
    useVST3Store.setState({ connectionStatus: 'disconnected' });
    render(<VST3PluginBrowser />);
    expect(screen.getByTestId('plugin-browser-disconnected')).toBeInTheDocument();
    expect(screen.getByText('Companion not connected')).toBeInTheDocument();
  });

  it('search filters plugins by name', () => {
    render(<VST3PluginBrowser />);
    const input = screen.getByTestId('plugin-search');
    fireEvent.change(input, { target: { value: 'super' } });
    const rows = screen.getAllByTestId('plugin-row');
    expect(rows).toHaveLength(1);
    expect(screen.getByText('SuperSynth')).toBeInTheDocument();
  });

  it('search filters by vendor', () => {
    render(<VST3PluginBrowser />);
    fireEvent.change(screen.getByTestId('plugin-search'), { target: { value: 'betasoft' } });
    const rows = screen.getAllByTestId('plugin-row');
    expect(rows).toHaveLength(2);
  });

  it('category filter shows only instruments', () => {
    render(<VST3PluginBrowser />);
    fireEvent.click(screen.getByTestId('category-tab-instrument'));
    const rows = screen.getAllByTestId('plugin-row');
    expect(rows).toHaveLength(2);
    expect(screen.getByText('SuperSynth')).toBeInTheDocument();
    expect(screen.getByText('BassLine')).toBeInTheDocument();
  });

  it('category filter shows only effects', () => {
    render(<VST3PluginBrowser />);
    fireEvent.click(screen.getByTestId('category-tab-effect'));
    const rows = screen.getAllByTestId('plugin-row');
    expect(rows).toHaveLength(2);
    expect(screen.getByText('MegaReverb')).toBeInTheDocument();
    expect(screen.getByText('EQMaster')).toBeInTheDocument();
  });

  it('Load button calls onLoadPlugin', () => {
    const onLoad = vi.fn();
    render(<VST3PluginBrowser onLoadPlugin={onLoad} />);
    const loadButtons = screen.getAllByTestId('plugin-load-btn');
    fireEvent.click(loadButtons[0]);
    expect(onLoad).toHaveBeenCalledWith('p3'); // BassLine (sorted by name first)
  });

  it('shows empty state when no plugins and not scanning', () => {
    useVST3Store.setState({ plugins: [] });
    render(<VST3PluginBrowser />);
    expect(screen.getByTestId('plugin-browser-empty')).toBeInTheDocument();
  });

  it('shows scan progress when scanning', () => {
    useVST3Store.setState({
      scanning: true,
      scanProgress: { scanned: 5, total: 20, currentPlugin: 'TestPlugin' },
    });
    render(<VST3PluginBrowser />);
    expect(screen.getByTestId('scan-progress')).toBeInTheDocument();
  });

  describe('drag and drop', () => {
    it('plugin rows are draggable', () => {
      render(<VST3PluginBrowser />);
      const rows = screen.getAllByTestId('plugin-row');
      expect(rows[0]).toHaveAttribute('draggable', 'true');
    });

    it('dragStart sets application/x-vst3-plugin data with plugin id', () => {
      render(<VST3PluginBrowser />);
      const rows = screen.getAllByTestId('plugin-row');
      // First row is BassLine (p3) after alphabetical sort
      const dataTransfer = {
        setData: vi.fn(),
        effectAllowed: '',
      };
      fireEvent.dragStart(rows[0], { dataTransfer });
      expect(dataTransfer.setData).toHaveBeenCalledWith('application/x-vst3-plugin', 'p3');
      expect(dataTransfer.effectAllowed).toBe('copy');
    });

    it('plugin row reduces opacity during drag', () => {
      render(<VST3PluginBrowser />);
      const rows = screen.getAllByTestId('plugin-row');
      fireEvent.dragStart(rows[0], {
        dataTransfer: { setData: vi.fn(), effectAllowed: '' },
      });
      expect(rows[0]).toHaveStyle({ opacity: '0.5' });
    });

    it('plugin row restores opacity on drag end', () => {
      render(<VST3PluginBrowser />);
      const rows = screen.getAllByTestId('plugin-row');
      fireEvent.dragStart(rows[0], {
        dataTransfer: { setData: vi.fn(), effectAllowed: '' },
      });
      fireEvent.dragEnd(rows[0]);
      expect(rows[0]).toHaveStyle({ opacity: '1' });
    });
  });
});
