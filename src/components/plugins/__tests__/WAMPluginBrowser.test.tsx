import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WAMPluginBrowser } from '../WAMPluginBrowser';
import { useWAMStore } from '../../../store/wamStore';
import { WAM_CATALOG } from '../../../services/wam/WAMCatalog';

describe('WAMPluginBrowser', () => {
  beforeEach(() => {
    useWAMStore.setState({
      hostStatus: 'ready',
      hostError: null,
      instances: {},
      pluginOrder: {},
      presets: {},
      _adapters: new Map(),
    });
  });

  it('should render the plugin list when host is ready', () => {
    render(<WAMPluginBrowser />);
    expect(screen.getByTestId('wam-plugin-browser')).toBeInTheDocument();
    expect(screen.getByTestId('wam-plugin-list')).toBeInTheDocument();
  });

  it('should show not-ready state when host is idle', () => {
    useWAMStore.setState({ hostStatus: 'idle' });
    render(<WAMPluginBrowser />);
    expect(screen.getByTestId('wam-browser-not-ready')).toBeInTheDocument();
  });

  it('should show initializing message', () => {
    useWAMStore.setState({ hostStatus: 'initializing' });
    render(<WAMPluginBrowser />);
    expect(screen.getByText('Initializing WAM host...')).toBeInTheDocument();
  });

  it('should show error message', () => {
    useWAMStore.setState({ hostStatus: 'error' });
    render(<WAMPluginBrowser />);
    expect(screen.getByText('WAM host initialization failed')).toBeInTheDocument();
  });

  it('should render catalog entries', () => {
    render(<WAMPluginBrowser />);
    const rows = screen.getAllByTestId('wam-plugin-row');
    expect(rows.length).toBe(WAM_CATALOG.length);
  });

  it('should filter by search query', () => {
    render(<WAMPluginBrowser />);
    const search = screen.getByTestId('wam-search');
    fireEvent.change(search, { target: { value: 'delay' } });

    const rows = screen.getAllByTestId('wam-plugin-row');
    expect(rows.length).toBeLessThan(WAM_CATALOG.length);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('should filter by category', () => {
    render(<WAMPluginBrowser />);
    const instrumentTab = screen.getByTestId('wam-category-tab-instrument');
    fireEvent.click(instrumentTab);

    const rows = screen.getAllByTestId('wam-plugin-row');
    expect(rows.length).toBe(WAM_CATALOG.filter((e) => e.category === 'instrument').length);
  });

  it('should call onLoadPlugin when Load button is clicked', () => {
    const onLoad = vi.fn();
    render(<WAMPluginBrowser onLoadPlugin={onLoad} />);

    const loadBtns = screen.getAllByTestId('wam-load-btn');
    fireEvent.click(loadBtns[0]);

    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenCalledWith(WAM_CATALOG[0]);
  });

  it('should toggle URL input section', () => {
    render(<WAMPluginBrowser />);

    expect(screen.queryByTestId('wam-url-input-section')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('wam-url-toggle'));
    expect(screen.getByTestId('wam-url-input-section')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('wam-url-toggle'));
    expect(screen.queryByTestId('wam-url-input-section')).not.toBeInTheDocument();
  });

  it('should load plugin from custom URL', () => {
    const onLoad = vi.fn();
    render(<WAMPluginBrowser onLoadPlugin={onLoad} />);

    fireEvent.click(screen.getByTestId('wam-url-toggle'));
    const urlInput = screen.getByTestId('wam-url-input');
    fireEvent.change(urlInput, { target: { value: 'https://example.com/plugin.js' } });
    fireEvent.click(screen.getByTestId('wam-url-load-btn'));

    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad.mock.calls[0][0].url).toBe('https://example.com/plugin.js');
  });

  it('should show empty state when no results match', () => {
    render(<WAMPluginBrowser />);
    const search = screen.getByTestId('wam-search');
    fireEvent.change(search, { target: { value: 'xyznonexistent' } });

    expect(screen.getByTestId('wam-browser-empty')).toBeInTheDocument();
  });
});
