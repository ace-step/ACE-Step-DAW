import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VST3SidePanel } from '../VST3SidePanel';
import { useUIStore } from '../../../store/uiStore';
import { useVST3Store } from '../../../store/vst3Store';
import { useProjectStore } from '../../../store/projectStore';

describe('VST3SidePanel', () => {
  beforeEach(() => {
    useUIStore.setState({ showVST3Panel: false, selectedTrackIds: new Set() });
    useVST3Store.setState({
      connectionStatus: 'connected',
      plugins: [
        {
          id: 'com.xfer.serum',
          name: 'Serum',
          vendor: 'Xfer Records',
          version: '1.0.0',
          category: 'instrument',
          subcategory: 'Synthesizer',
        },
      ],
      instances: {},
    });
  });

  it('is not rendered when showVST3Panel is false', () => {
    render(<VST3SidePanel />);
    expect(screen.queryByTestId('vst3-side-panel')).toBeNull();
  });

  it('is visible when showVST3Panel is true', () => {
    useUIStore.setState({ showVST3Panel: true });
    render(<VST3SidePanel />);
    const panel = screen.getByTestId('vst3-side-panel');
    expect(panel).toHaveAttribute('aria-hidden', 'false');
  });

  it('closes panel when close button is clicked', () => {
    useUIStore.setState({ showVST3Panel: true });
    render(<VST3SidePanel />);
    fireEvent.click(screen.getByTestId('vst3-panel-close'));
    expect(useUIStore.getState().showVST3Panel).toBe(false);
  });

  it('contains the plugin browser', () => {
    useUIStore.setState({ showVST3Panel: true });
    render(<VST3SidePanel />);
    expect(screen.getByTestId('vst3-side-panel')).toBeInTheDocument();
  });

  it('calls loadPlugin with first track when Load button is clicked', () => {
    useUIStore.setState({ showVST3Panel: true });
    useProjectStore.setState({
      project: {
        id: 'proj-1',
        name: 'Test',
        bpm: 120,
        tracks: [{ id: 'track-1', name: 'Track 1', type: 'stems', clips: [], color: '#fff', mute: false, solo: false, volume: 0.8, pan: 0 }],
      } as any,
    });

    const loadPluginSpy = vi.spyOn(useVST3Store.getState(), 'loadPlugin');

    render(<VST3SidePanel />);

    const loadButtons = screen.getAllByTestId('plugin-load-btn');
    expect(loadButtons.length).toBeGreaterThan(0);
    fireEvent.click(loadButtons[0]);

    expect(loadPluginSpy).toHaveBeenCalledWith('com.xfer.serum', 'track-1');
    loadPluginSpy.mockRestore();
  });

  it('uses selected track when available', () => {
    useUIStore.setState({
      showVST3Panel: true,
      selectedTrackIds: new Set(['track-selected']),
    });
    useProjectStore.setState({
      project: {
        id: 'proj-1',
        name: 'Test',
        bpm: 120,
        tracks: [
          { id: 'track-1', name: 'Track 1', type: 'stems', clips: [], color: '#fff', mute: false, solo: false, volume: 0.8, pan: 0 },
          { id: 'track-selected', name: 'Selected', type: 'stems', clips: [], color: '#fff', mute: false, solo: false, volume: 0.8, pan: 0 },
        ],
      } as any,
    });

    const loadPluginSpy = vi.spyOn(useVST3Store.getState(), 'loadPlugin');

    render(<VST3SidePanel />);

    const loadButtons = screen.getAllByTestId('plugin-load-btn');
    fireEvent.click(loadButtons[0]);

    expect(loadPluginSpy).toHaveBeenCalledWith('com.xfer.serum', 'track-selected');
    loadPluginSpy.mockRestore();
  });
});
