import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WAMSidePanel } from '../WAMSidePanel';
import { useWAMStore } from '../../../store/wamStore';
import { useUIStore } from '../../../store/uiStore';
import { useProjectStore } from '../../../store/projectStore';

describe('WAMSidePanel', () => {
  beforeEach(() => {
    useWAMStore.setState({
      hostStatus: 'ready',
      instances: {},
      pluginOrder: {},
      presets: {},
      _adapters: new Map(),
    });
    useUIStore.setState({ showWAMPanel: true });
    useProjectStore.setState({
      project: {
        id: 'test-project',
        name: 'Test',
        bpm: 120,
        timeSignature: [4, 4],
        tracks: [
          {
            id: 'track-1',
            displayName: 'Track 1',
            type: 'audio',
            volume: 0.8,
            pan: 0,
            muted: false,
            solo: false,
            armed: false,
            color: '#ff0000',
            clips: [],
            effects: { eq: { low: 0, mid: 0, high: 0 }, reverb: 0, delay: 0, chorus: 0 },
            plugins: [],
          },
        ],
        masterVolume: 0.8,
      } as any,
    });
  });

  it('should render when showWAMPanel is true', () => {
    render(<WAMSidePanel />);
    expect(screen.getByTestId('wam-side-panel')).toBeInTheDocument();
  });

  it('should not render when showWAMPanel is false and animation complete', () => {
    useUIStore.setState({ showWAMPanel: false });
    render(<WAMSidePanel />);
    expect(screen.queryByTestId('wam-side-panel')).not.toBeInTheDocument();
  });

  it('should show header with WAM title and Web Audio badge', () => {
    render(<WAMSidePanel />);
    expect(screen.getByText('WAM Plugins')).toBeInTheDocument();
    expect(screen.getByText('Web Audio')).toBeInTheDocument();
  });

  it('should close panel when close button is clicked', () => {
    render(<WAMSidePanel />);
    fireEvent.click(screen.getByTestId('wam-panel-close'));
    expect(useUIStore.getState().showWAMPanel).toBe(false);
  });

  it('should show empty state for active plugins', () => {
    render(<WAMSidePanel />);
    expect(screen.getByText('No WAM plugins loaded. Browse and load a plugin above.')).toBeInTheDocument();
  });

  it('should show active plugin count', () => {
    useWAMStore.setState({
      instances: {
        'inst-1': {
          instanceId: 'inst-1',
          pluginId: 'test',
          pluginName: 'Test Plugin',
          vendor: 'Test',
          trackId: 'track-1',
          enabled: true,
          parameters: [],
          parameterValues: {},
          activePreset: null,
          presets: [],
          hasGui: false,
          guiVisible: false,
          descriptor: null,
        },
      },
      pluginOrder: { 'track-1': ['inst-1'] },
    });

    render(<WAMSidePanel />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Test Plugin')).toBeInTheDocument();
  });
});
