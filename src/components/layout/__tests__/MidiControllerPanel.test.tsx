import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MidiControllerPanel } from '../MidiControllerPanel';
import { useUIStore } from '../../../store/uiStore';
import { useMidiControllerStore } from '../../../store/midiControllerStore';
import type { MidiDevice, MidiMapping } from '../../../types/midiController';

// Mock WebMidiService to avoid real MIDI access
vi.mock('../../../services/webMidiService', () => ({
  WebMidiService: {
    isSupported: vi.fn(() => false),
  },
  getWebMidiService: vi.fn(() => ({
    connect: vi.fn().mockResolvedValue([]),
    onDeviceChange: vi.fn(() => vi.fn()),
    onMessage: vi.fn(() => vi.fn()),
    destroy: vi.fn(),
  })),
}));

const device1: MidiDevice = {
  id: 'dev-1',
  name: 'Test Keyboard',
  manufacturer: 'TestCorp',
  state: 'connected',
};

function makeMapping(overrides: Partial<MidiMapping> = {}): MidiMapping {
  return {
    id: 'map-1',
    deviceId: 'dev-1',
    deviceName: 'Test Keyboard',
    channel: 0,
    controlType: 'cc',
    controlNumber: 7,
    targetParam: 'track:t1:volume',
    targetLabel: 'Track 1 Volume',
    min: 0,
    max: 1,
    ...overrides,
  };
}

function resetStores() {
  useUIStore.setState({
    showMidiControllerPanel: false,
  });
  useMidiControllerStore.setState(useMidiControllerStore.getInitialState());
}

describe('MidiControllerPanel', () => {
  beforeEach(resetStores);

  it('renders nothing when panel is hidden', () => {
    render(<MidiControllerPanel />);
    expect(screen.queryByTestId('midi-controller-panel')).toBeNull();
  });

  it('renders when panel is shown', () => {
    useUIStore.setState({ showMidiControllerPanel: true });
    render(<MidiControllerPanel />);
    expect(screen.getByTestId('midi-controller-panel')).toBeTruthy();
    expect(screen.getByText('MIDI Controllers')).toBeTruthy();
  });

  it('shows device count and mapping count in header', () => {
    useMidiControllerStore.setState({
      devices: [device1],
      mappings: [makeMapping()],
    });
    useUIStore.setState({ showMidiControllerPanel: true });
    render(<MidiControllerPanel />);
    expect(screen.getByText(/1 device/)).toBeTruthy();
    expect(screen.getByText(/1 mapping/)).toBeTruthy();
  });

  it('shows empty state for devices tab', () => {
    useUIStore.setState({ showMidiControllerPanel: true });
    render(<MidiControllerPanel />);
    expect(screen.getByText(/No MIDI devices detected/)).toBeTruthy();
  });

  it('displays connected devices', () => {
    useMidiControllerStore.setState({ devices: [device1] });
    useUIStore.setState({ showMidiControllerPanel: true });
    render(<MidiControllerPanel />);
    expect(screen.getByText('Test Keyboard')).toBeTruthy();
    expect(screen.getByText('TestCorp')).toBeTruthy();
  });

  it('switches to mappings tab', () => {
    useUIStore.setState({ showMidiControllerPanel: true });
    render(<MidiControllerPanel />);
    fireEvent.click(screen.getByText(/Mappings/));
    expect(screen.getByText(/No mappings yet/)).toBeTruthy();
  });

  it('displays active mappings', () => {
    useMidiControllerStore.setState({
      mappings: [makeMapping()],
    });
    useUIStore.setState({ showMidiControllerPanel: true });
    render(<MidiControllerPanel />);
    fireEvent.click(screen.getByText(/Mappings/));
    expect(screen.getByText('Track 1 Volume')).toBeTruthy();
    expect(screen.getByText('CC 7')).toBeTruthy();
  });

  it('removes a mapping when X button is clicked', () => {
    useMidiControllerStore.setState({
      mappings: [makeMapping({ id: 'map-to-remove' })],
    });
    useUIStore.setState({ showMidiControllerPanel: true });
    render(<MidiControllerPanel />);
    fireEvent.click(screen.getByText(/Mappings/));
    fireEvent.click(screen.getByLabelText('Remove mapping for Track 1 Volume'));
    expect(useMidiControllerStore.getState().mappings).toHaveLength(0);
  });

  it('toggles enabled state', () => {
    useUIStore.setState({ showMidiControllerPanel: true });
    render(<MidiControllerPanel />);
    const onBtn = screen.getByText('ON');
    expect(useMidiControllerStore.getState().enabled).toBe(true);
    fireEvent.click(onBtn);
    expect(useMidiControllerStore.getState().enabled).toBe(false);
  });

  it('closes panel via close button', () => {
    useUIStore.setState({ showMidiControllerPanel: true });
    render(<MidiControllerPanel />);
    fireEvent.click(screen.getByLabelText('Close MIDI controller panel'));
    expect(useUIStore.getState().showMidiControllerPanel).toBe(false);
  });

  it('shows MIDI Learn badge when learn mode is active', () => {
    useMidiControllerStore.setState({
      learnMode: {
        active: true,
        targetParam: 'track:t1:volume',
        targetLabel: 'Track 1 Volume',
      },
    });
    useUIStore.setState({ showMidiControllerPanel: true });
    render(<MidiControllerPanel />);
    expect(screen.getByText(/Waiting for MIDI input/)).toBeTruthy();
    expect(screen.getByText(/Track 1 Volume/)).toBeTruthy();
  });

  it('cancels MIDI Learn when cancel button clicked', () => {
    useMidiControllerStore.setState({
      learnMode: {
        active: true,
        targetParam: 'track:t1:volume',
        targetLabel: 'Track 1 Volume',
      },
    });
    useUIStore.setState({ showMidiControllerPanel: true });
    render(<MidiControllerPanel />);
    fireEvent.click(screen.getByLabelText('Cancel MIDI Learn'));
    expect(useMidiControllerStore.getState().learnMode.active).toBe(false);
  });
});
