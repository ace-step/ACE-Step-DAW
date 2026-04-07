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

describe('VST3PluginBrowser favorites', () => {
  beforeEach(() => {
    localStorage.clear();
    useVST3Store.setState({
      connectionStatus: 'connected',
      plugins: SAMPLE_PLUGINS,
      scanning: false,
      scanProgress: null,
      favoritePluginIds: new Set(),
    });
  });

  it('renders favorite star buttons on each plugin row', () => {
    render(<VST3PluginBrowser />);
    const stars = screen.getAllByTestId('favorite-btn');
    expect(stars).toHaveLength(4);
  });

  it('clicking favorite star toggles favorite state', () => {
    render(<VST3PluginBrowser />);
    const stars = screen.getAllByTestId('favorite-btn');
    // First row is BassLine (p3) after alphabetical sort
    fireEvent.click(stars[0]);
    expect(useVST3Store.getState().favoritePluginIds.has('p3')).toBe(true);
  });

  it('favorited plugins show filled star', () => {
    useVST3Store.setState({ favoritePluginIds: new Set(['p1']) });
    render(<VST3PluginBrowser />);
    // SuperSynth (p1) is favorited so sorts first
    const stars = screen.getAllByTestId('favorite-btn');
    const superSynthStar = stars[0];
    expect(superSynthStar).toHaveAttribute('aria-pressed', 'true');
  });

  it('favorites tab shows only favorited plugins', () => {
    useVST3Store.setState({ favoritePluginIds: new Set(['p1', 'p2']) });
    render(<VST3PluginBrowser />);
    fireEvent.click(screen.getByTestId('category-tab-favorites'));
    const rows = screen.getAllByTestId('plugin-row');
    expect(rows).toHaveLength(2);
  });
});

describe('VST3PluginBrowser vendor filter', () => {
  beforeEach(() => {
    useVST3Store.setState({
      connectionStatus: 'connected',
      plugins: SAMPLE_PLUGINS,
      scanning: false,
      scanProgress: null,
      favoritePluginIds: new Set(),
    });
  });

  it('renders vendor filter dropdown', () => {
    render(<VST3PluginBrowser />);
    expect(screen.getByTestId('vendor-filter')).toBeInTheDocument();
  });

  it('vendor filter dropdown lists all vendors', () => {
    render(<VST3PluginBrowser />);
    const vendorFilter = screen.getByTestId('vendor-filter');
    expect(vendorFilter).toHaveTextContent('All Vendors');
    expect(vendorFilter).toHaveTextContent('AcmeCo');
    expect(vendorFilter).toHaveTextContent('BetaSoft');
  });

  it('selecting a vendor filters plugins', () => {
    render(<VST3PluginBrowser />);
    fireEvent.change(screen.getByTestId('vendor-filter'), { target: { value: 'BetaSoft' } });
    const rows = screen.getAllByTestId('plugin-row');
    expect(rows).toHaveLength(2);
    expect(screen.getByText('BassLine')).toBeInTheDocument();
    expect(screen.getByText('EQMaster')).toBeInTheDocument();
  });

  it('vendor filter combines with category filter', () => {
    render(<VST3PluginBrowser />);
    fireEvent.change(screen.getByTestId('vendor-filter'), { target: { value: 'BetaSoft' } });
    fireEvent.click(screen.getByTestId('category-tab-instrument'));
    const rows = screen.getAllByTestId('plugin-row');
    expect(rows).toHaveLength(1);
    expect(screen.getByText('BassLine')).toBeInTheDocument();
  });

  it('vendor filter combines with search', () => {
    render(<VST3PluginBrowser />);
    fireEvent.change(screen.getByTestId('vendor-filter'), { target: { value: 'AcmeCo' } });
    fireEvent.change(screen.getByTestId('plugin-search'), { target: { value: 'mega' } });
    const rows = screen.getAllByTestId('plugin-row');
    expect(rows).toHaveLength(1);
    expect(screen.getByText('MegaReverb')).toBeInTheDocument();
  });
});

describe('VST3PluginBrowser scan progress with categorization', () => {
  it('shows scan progress bar with percentage', () => {
    useVST3Store.setState({
      connectionStatus: 'connected',
      plugins: [],
      scanning: true,
      scanProgress: { scanned: 5, total: 20, currentPlugin: 'TestPlugin' },
      favoritePluginIds: new Set(),
    });
    render(<VST3PluginBrowser />);
    expect(screen.getByTestId('scan-progress')).toBeInTheDocument();
    expect(screen.getByTestId('scan-progress-bar')).toBeInTheDocument();
  });

  it('shows plugin count summary when connected with plugins', () => {
    useVST3Store.setState({
      connectionStatus: 'connected',
      plugins: SAMPLE_PLUGINS,
      scanning: false,
      scanProgress: null,
      favoritePluginIds: new Set(),
    });
    render(<VST3PluginBrowser />);
    expect(screen.getByTestId('plugin-count-summary')).toBeInTheDocument();
    // 2 instruments, 2 effects = 4 total
    expect(screen.getByTestId('plugin-count-summary')).toHaveTextContent('4');
  });
});
