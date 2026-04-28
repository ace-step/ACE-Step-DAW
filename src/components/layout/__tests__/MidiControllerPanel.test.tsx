import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MidiControllerPanel } from '../MidiControllerPanel';
import { useUIStore } from '../../../store/uiStore';
import { useMidiControllerStore } from '../../../store/midiControllerStore';
import { WebMidiService } from '../../../services/webMidiService';
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

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

describe('MidiControllerPanel', () => {
  beforeEach(resetStores);

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(URL, 'createObjectURL', {
      value: originalCreateObjectURL,
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: originalRevokeObjectURL,
      configurable: true,
    });
  });

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
    expect(screen.getByText(/Connect a controller and toggle MIDI ON/)).toBeTruthy();
  });

  it('shows MIDI connection errors from the controller store', () => {
    vi.mocked(WebMidiService.isSupported).mockReturnValueOnce(true);
    useMidiControllerStore.setState({ connectionError: 'Permission denied' });
    useUIStore.setState({ showMidiControllerPanel: true });
    render(<MidiControllerPanel />);
    expect(screen.getByText('Permission denied')).toBeTruthy();
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

  it('delays revoking exported mapping blob URL until after the click dispatch', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:midi-mappings');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectURL,
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectURL,
      configurable: true,
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    useMidiControllerStore.setState({
      mappings: [makeMapping()],
    });
    useUIStore.setState({ showMidiControllerPanel: true });
    render(<MidiControllerPanel />);

    fireEvent.click(screen.getByText('Export'));

    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:midi-mappings');
  });

  it('toggles enabled state', () => {
    useUIStore.setState({ showMidiControllerPanel: true });
    render(<MidiControllerPanel />);
    const offBtn = screen.getByText('OFF');
    expect(useMidiControllerStore.getState().enabled).toBe(false);
    fireEvent.click(offBtn);
    expect(useMidiControllerStore.getState().enabled).toBe(true);
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
